-- Colega Website Admin Panel — temporary/admin-granted entitlements (Section 9: demo/support
-- access). Run after 0020 and 0021, same project. Safe to re-run.
--
-- IMPORTANT — this is the one migration in this set that changes a function DESKTOP also
-- calls (get_my_entitlement(), used internally by create_organization() per
-- colega/supabase/migrations/0018_company_creation_service_path.sql). Review this one
-- carefully before running. The change is deliberately additive and backward-compatible:
--   * same function name, same argument list, same RETURNS TABLE shape as 0014's original —
--     every existing caller (desktop, create_organization()) keeps working unchanged.
--   * with NO row in admin_entitlement_grants for a user, behavior is BYTE-FOR-BYTE identical
--     to the original 0014 function — this migration only changes the computed result when an
--     active grant actually exists.
--   * a grant only ever RAISES the effective plan (pro/teams), never lowers it below whatever
--     the real subscriptions row already resolves to, and never writes to subscriptions itself
--     (Section 9: "Do not overwrite real paid subscription information").
--
-- ============================================================================
-- admin_entitlement_grants — one row per grant. A user can have several rows over time
-- (history is kept, not overwritten); "active" means revoked_at is null and expires_at is in
-- the future. Distinguishable from paid subscriptions by construction: this is a completely
-- separate table from `subscriptions`, never merged into it.
-- ============================================================================
create table if not exists public.admin_entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('pro', 'teams')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reason text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  constraint admin_entitlement_grants_expiry_after_grant check (expires_at > granted_at)
);

create index if not exists admin_entitlement_grants_user_idx
  on public.admin_entitlement_grants (user_id);
-- Fast "does this user have an active grant right now" lookup — used by get_my_entitlement()
-- below on every call, so every real query against this table in this codebase can use it.
create index if not exists admin_entitlement_grants_active_idx
  on public.admin_entitlement_grants (user_id, expires_at)
  where revoked_at is null;

alter table public.admin_entitlement_grants enable row level security;

-- A user can see their OWN grants (so a future "you have temporary Pro access, expires in 3
-- days" UI is possible without any schema change) — same self-only discipline as every other
-- user-scoped table in this schema.
drop policy if exists "users can read their own entitlement grants" on public.admin_entitlement_grants;
create policy "users can read their own entitlement grants"
  on public.admin_entitlement_grants for select
  using (auth.uid() = user_id);

drop policy if exists "admins can read all entitlement grants" on public.admin_entitlement_grants;
create policy "admins can read all entitlement grants"
  on public.admin_entitlement_grants for select
  using (public.is_admin());

-- An admin may only ever insert a grant attributing it to THEMSELVES as granted_by — same
-- non-forgeable-attribution discipline as admin_audit_log's insert policy.
drop policy if exists "admins can insert entitlement grants" on public.admin_entitlement_grants;
create policy "admins can insert entitlement grants"
  on public.admin_entitlement_grants for insert
  with check (public.is_admin() and granted_by = auth.uid());

-- Revoking is an update of exactly revoked_at/revoked_by, done by an admin, attributing the
-- revocation to themselves. Not column-restricted at the database level (any admin update must
-- still pass this check), but the only UPDATE this codebase ever issues is a revoke (see
-- src/lib/admin/actions.ts) — every call is also audit-logged.
drop policy if exists "admins can revoke entitlement grants" on public.admin_entitlement_grants;
create policy "admins can revoke entitlement grants"
  on public.admin_entitlement_grants for update
  using (public.is_admin())
  with check (public.is_admin() and revoked_by = auth.uid());

-- ============================================================================
-- get_my_entitlement() — extended to fold in an active admin grant, additively (see header).
-- ============================================================================
create or replace function public.get_my_entitlement()
returns table (
  plan text,
  status text,
  can_use_screen_intelligence boolean,
  has_unlimited_personal_usage boolean,
  can_create_company boolean,
  can_use_personal_rules boolean,
  current_period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  row_plan text;
  row_status text;
  row_period_end timestamptz;
  subscription_plan text;
  grant_plan text;
  grant_expires_at timestamptz;
  effective_plan text;
  effective_period_end timestamptz;
  plan_rank constant jsonb := '{"free": 0, "pro": 1, "teams": 2}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select s.plan, s.status, s.current_period_end
  into row_plan, row_status, row_period_end
  from public.subscriptions s
  where s.user_id = auth.uid();

  -- Unchanged from 0014: no row, non-active/non-trialing status, or a lapsed period end -> Free.
  if row_plan is null
    or row_status not in ('active', 'trialing')
    or (row_period_end is not null and row_period_end < now())
  then
    subscription_plan := 'free';
  else
    subscription_plan := row_plan;
  end if;

  -- New: the caller's single most-generous ACTIVE admin grant (not revoked, not expired).
  select g.plan, g.expires_at
  into grant_plan, grant_expires_at
  from public.admin_entitlement_grants g
  where g.user_id = auth.uid()
    and g.revoked_at is null
    and g.expires_at > now()
  order by (plan_rank->>g.plan)::int desc, g.expires_at desc
  limit 1;

  -- The grant only ever raises the effective plan, never lowers a real paid subscription below
  -- what it already grants (Section 9: never overwrite real subscription information).
  if grant_plan is not null
     and (plan_rank->>grant_plan)::int > (plan_rank->>subscription_plan)::int
  then
    effective_plan := grant_plan;
    effective_period_end := grant_expires_at;
  else
    effective_plan := subscription_plan;
    effective_period_end := row_period_end;
  end if;

  return query select
    effective_plan,
    coalesce(row_status, 'active'),
    true, -- every plan can use Screen Intelligence (Free is quota-limited, not blocked)
    effective_plan in ('pro', 'teams'),
    effective_plan = 'teams',
    effective_plan in ('pro', 'teams'),
    effective_period_end;
end;
$$;

revoke all on function public.get_my_entitlement() from public;
revoke all on function public.get_my_entitlement() from anon;
grant execute on function public.get_my_entitlement() to authenticated;

-- ============================================================================
-- admin_overview_stats() — the /admin overview page's counters. Only counts things that are
-- genuinely stored today (Section 5: never invent a number) — no session/usage duration, no
-- MRR/revenue (no billing integration exists yet, see this file's header and the final
-- report). Lives here rather than 0020 because it counts admin_entitlement_grants rows,
-- defined above. Same no-FROM-clause `where public.is_admin()` gating as 0020's functions: a
-- non-admin caller gets zero rows, never an error.
-- ============================================================================
create or replace function public.admin_overview_stats()
returns table (
  total_users bigint,
  new_users_today bigint,
  new_users_this_week bigint,
  free_users bigint,
  pro_users bigint,
  teams_users bigint,
  active_temporary_grants bigint,
  organizations_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users where created_at >= date_trunc('day', now())),
    (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    (select count(*) from auth.users u left join public.subscriptions s on s.user_id = u.id
       where coalesce(s.plan, 'free') = 'free'),
    (select count(*) from public.subscriptions where plan = 'pro' and status in ('active', 'trialing')),
    (select count(*) from public.subscriptions where plan = 'teams' and status in ('active', 'trialing')),
    (select count(*) from public.admin_entitlement_grants where revoked_at is null and expires_at > now()),
    (select count(*) from public.organizations where archived_at is null)
  where public.is_admin();
$$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_overview_stats() from anon;
grant execute on function public.admin_overview_stats() to authenticated;
