-- Colega Website Admin Panel — admin authorization model.
--
-- Lives in colega-web (not colega/supabase/migrations) because this feature is website-owned,
-- but it targets the SAME Supabase project as the desktop app's own migrations (0001-0019) and
-- must be run against that same project — SQL Editor -> paste -> Run, or `supabase db push`
-- from whichever repo you keep linked to the project. Safe to re-run (idempotent).
--
-- Does NOT touch any existing table, policy, or function from 0001-0019. Only adds new objects
-- plus new ADDITIVE read policies (see bottom) on existing tables — Postgres OR's multiple
-- permissive policies for the same command together, so existing user-self policies are
-- unchanged and unweakened; admins simply gain an additional way to satisfy SELECT.
--
-- ============================================================================
-- admin_users — the whole authorization model. Membership in this table (not a username, not
-- a client-side check) is what "is an admin" means, checked server-side on every request.
-- ============================================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support')),
  created_at timestamptz not null default now(),
  -- Who granted this row — null only for the very first bootstrap row, which must be inserted
  -- manually (SQL Editor) after confirming the correct auth.users.id; see this project's report
  -- for why that step could not be done automatically.
  created_by uuid references auth.users(id)
);

alter table public.admin_users enable row level security;

-- SECURITY DEFINER so it can be called by any authenticated user to ask "am I an admin" without
-- needing a read policy on admin_users that could itself be probed — same documented pattern
-- desktop already uses for is_work_room_member/is_work_room_owner (see
-- 0002_fix_work_room_rls.sql) to avoid recursive-policy bugs.
--
-- Deliberately NO parameter — earlier draft of this migration took an optional check_user_id
-- uuid (defaulting to auth.uid()), which in hindsight let ANY authenticated caller ask
-- `is_admin('<someone-elses-uuid>')` and enumerate which OTHER accounts are admins, a real
-- caller-supplied-identity leak this review step exists to catch. Nothing in this codebase ever
-- needs "is that OTHER uuid an admin" — every real use (the RLS policies below, the admin
-- guard in src/lib/admin/guard.ts, the cosmetic nav check in AccountMenu) is "am I an admin",
-- so the function can only ever answer that question, for the caller, full stop.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- Admins can see the (short) admin roster; nobody can write via the client — this table is
-- deliberately writable ONLY through the service-role admin client on the server (see
-- src/lib/supabase/admin.ts), which bypasses RLS entirely. That keeps "who can grant admin
-- access" out of reach of RLS policy bugs by construction: there is no insert/update/delete
-- policy at all, so the anon/authenticated roles cannot write this table under any condition.
drop policy if exists "admins can read admin_users" on public.admin_users;
create policy "admins can read admin_users"
  on public.admin_users for select
  using (public.is_admin());

-- ============================================================================
-- Admin read access to existing tables — ADDITIVE ONLY. Each of these is a new permissive
-- policy alongside the table's existing self-only policy; RLS OR's multiple permissive
-- policies for the same command, so nothing here narrows what a normal user could already see
-- of their OWN data. Writes to these tables are NOT granted here — admin mutations that need
-- to touch another user's row go through the service-role client server-side (see
-- src/lib/admin/actions.ts), audited in admin_audit_log (0021).
-- ============================================================================
drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "admins can read all subscriptions" on public.subscriptions;
create policy "admins can read all subscriptions"
  on public.subscriptions for select
  using (public.is_admin());

drop policy if exists "admins can read all organizations" on public.organizations;
create policy "admins can read all organizations"
  on public.organizations for select
  using (public.is_admin());

drop policy if exists "admins can read all organization_members" on public.organization_members;
create policy "admins can read all organization_members"
  on public.organization_members for select
  using (public.is_admin());

-- ============================================================================
-- admin_list_users / admin_get_auth_user — SECURITY DEFINER functions that read auth.users.
-- No PostgREST/RLS path can ever expose auth.users to a client directly, so this is the only
-- way to build a searchable admin user list without the service-role Admin API. Both are
-- self-gating: the inner `where public.is_admin()` means a non-admin caller gets zero rows
-- back (never an error that would hint at internal structure), matching the SECURITY DEFINER
-- functions' `select ... where` gating style already used elsewhere in this schema (e.g.
-- get_public_profiles). The migration-runner role (typically `postgres`) has SELECT on
-- auth.users in a standard Supabase project; if your project has restricted that further, this
-- function will error on call and the admin panel's user list/detail pages will show a clear
-- "not available" state instead of crashing (see src/lib/admin/users.ts) — the fallback in that
-- case is the service-role `supabase.auth.admin.listUsers()` / `getUserById()` API, documented
-- there.
-- ============================================================================
create or replace function public.admin_list_users(
  search text default null,
  page_size int default 25,
  page_offset int default 0
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  username text,
  display_name text,
  plan text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with matched as (
    select
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until,
      p.username,
      p.display_name,
      coalesce(s.plan, 'free') as plan
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.subscriptions s on s.user_id = u.id
    where public.is_admin()
      and (
        search is null or btrim(search) = ''
        or u.email ilike '%' || search || '%'
        or p.username ilike '%' || search || '%'
        or p.display_name ilike '%' || search || '%'
        or u.id::text = search
      )
  )
  select m.*, count(*) over ()::bigint as total_count
  from matched m
  order by m.created_at desc
  limit greatest(page_size, 1)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.admin_list_users(text, int, int) from public;
revoke all on function public.admin_list_users(text, int, int) from anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

create or replace function public.admin_get_auth_user(target_id uuid)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from auth.users u
  where public.is_admin() and u.id = target_id;
$$;

revoke all on function public.admin_get_auth_user(uuid) from public;
revoke all on function public.admin_get_auth_user(uuid) from anon;
grant execute on function public.admin_get_auth_user(uuid) to authenticated;

-- admin_overview_stats() is defined in 0022_admin_entitlement_grants.sql instead of here — it
-- needs to count active admin_entitlement_grants rows, and that table doesn't exist until 0022
-- runs (a `language sql` function is parsed against the schema at CREATE time, so defining it
-- here would fail on a clean run before 0022).
