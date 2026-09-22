-- Production Backend & API Security phase — server-authoritative entitlements.
-- Run this against the same Supabase project that already has 0001-0013 applied.
--
-- Root problem this closes: `plan` has been a device-local Electron pref (prefs.devPlan,
-- electron/state.js) with NO server representation at all. Any client — the real desktop app
-- with a patched renderer, or a bare curl/PostgREST call — could already call
-- create_organization() as a Free or Pro user and successfully create a Company, because that
-- function (0007_organizations.sql) never checked plan, only `auth.uid() is not null`. This
-- migration gives Colega a real, database-backed subscription/entitlement record and closes that
-- gap at its actual enforcement point (the RPC itself, not the client that calls it).
--
-- Design notes:
--   * `subscriptions` has ONE row per user, defaulting conceptually to 'free' — there is
--     deliberately no INSERT/UPDATE/DELETE policy for `authenticated` or `anon` at all, so a
--     normal client can never write to it through PostgREST, full stop (spec §12: "user cannot
--     UPDATE their own plan... only trusted backend/webhook/service path may change billing
--     entitlement"). Only the service_role (used exclusively by a future Paddle
--     webhook/trusted-backend job, never the desktop) or a superuser via the SQL editor can write
--     here today. No row for a user = Free (fail-closed default, spec §12).
--   * `get_my_entitlement()` is the ONE place "what can this plan do" is resolved server-side —
--     mirrors src/core/entitlements.ts's ENTITLEMENTS_BY_PLAN table exactly (kept in sync
--     manually, same accepted-duplication convention this codebase already uses between
--     entitlements.ts and electron/quotaStore.js). A cancelled/past_due/expired subscription
--     resolves to 'free', never silently keeps paid entitlements (spec §87: "fail closed for
--     paid privilege").
--   * `create_organization` is now entitlement-gated: only a resolved plan of 'teams' may create
--     one. Existing invitation-acceptance/membership paths are untouched — a Free/Pro user can
--     still be invited into and use an existing Company exactly as before (spec §11/§56:
--     "Membership acceptance remains separate").

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'teams')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled')),
  -- Paddle preparation only (spec §54) — not populated or consumed by anything yet.
  billing_provider text check (billing_provider in ('paddle')),
  billing_customer_id text,
  billing_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_plan_idx on public.subscriptions (plan);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Desktop READ only — no write policy exists for authenticated/anon at all (see header comment).
drop policy if exists "users can read their own subscription" on public.subscriptions;
create policy "users can read their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ============================================================================
-- get_my_entitlement() — the single server-authoritative "what can this plan do" resolver.
-- SECURITY DEFINER so it can resolve "no row yet" -> free without needing a row to already exist
-- (RLS alone can't express "no row = a computed default"), but it only ever reads the CALLER's
-- own row (auth.uid()), same discipline as every other SECURITY DEFINER function in this schema.
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
  effective_plan text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select s.plan, s.status, s.current_period_end
  into row_plan, row_status, row_period_end
  from public.subscriptions s
  where s.user_id = auth.uid();

  -- No row, or a non-active/non-trialing status, or a lapsed period end -> Free. Never silently
  -- keep a paid entitlement past its own recorded expiry (spec §87).
  if row_plan is null
    or row_status not in ('active', 'trialing')
    or (row_period_end is not null and row_period_end < now())
  then
    effective_plan := 'free';
  else
    effective_plan := row_plan;
  end if;

  return query select
    effective_plan,
    coalesce(row_status, 'active'),
    true, -- every plan can use Screen Intelligence (Free is quota-limited, not blocked)
    effective_plan in ('pro', 'teams'),
    effective_plan = 'teams',
    effective_plan in ('pro', 'teams'),
    row_period_end;
end;
$$;

revoke all on function public.get_my_entitlement() from public;
revoke all on function public.get_my_entitlement() from anon;
grant execute on function public.get_my_entitlement() to authenticated;

-- ============================================================================
-- create_organization — add the missing entitlement gate (spec §56/§68/§99: "Free/Pro directly
-- creates Company -> DENY"). Everything else about this function is unchanged from
-- 0007_organizations.sql.
-- ============================================================================

create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed_name text := trim(org_name);
  new_org public.organizations;
  effective_plan text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select e.plan into effective_plan from public.get_my_entitlement() e;
  if effective_plan is distinct from 'teams' then
    raise exception 'TEAMS_ENTITLEMENT_REQUIRED' using errcode = '42501';
  end if;

  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 80 then
    raise exception 'Organization name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  insert into public.organizations (name, owner_id)
  values (trimmed_name, auth.uid())
  returning * into new_org;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.create_organization(text) from anon;
grant execute on function public.create_organization(text) to authenticated;
