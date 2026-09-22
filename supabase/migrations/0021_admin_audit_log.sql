-- Colega Website Admin Panel — audit log. Run after 0020_admin_users.sql, same project. Safe to
-- re-run.
--
-- Every sensitive admin mutation (grant/revoke temporary access, suspend/reactivate, org
-- membership changes) writes one row here server-side before returning success to the caller —
-- see src/lib/admin/actions.ts. Rows are immutable: no update/delete policy exists for any
-- role, and even admins can only insert (never edit or remove) a row via the client.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  target_org_id uuid references public.organizations(id),
  -- Free-form context for the action (e.g. {"plan":"pro","days":7,"reason":"sales demo"}).
  -- NEVER passwords, tokens, secrets, or full payment card data — enforced by convention in
  -- src/lib/admin/actions.ts (every call site builds this object explicitly, nothing is ever
  -- passed through raw), not by a database constraint.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_user_idx on public.admin_audit_log (target_user_id);
create index if not exists admin_audit_log_admin_idx on public.admin_audit_log (admin_user_id);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admins can read audit log" on public.admin_audit_log;
create policy "admins can read audit log"
  on public.admin_audit_log for select
  using (public.is_admin());

-- An admin may only ever insert a row attributing the action to THEMSELVES — never on another
-- admin's behalf — so even a compromised admin session can't forge who performed an action.
drop policy if exists "admins can insert their own audit rows" on public.admin_audit_log;
create policy "admins can insert their own audit rows"
  on public.admin_audit_log for insert
  with check (public.is_admin() and admin_user_id = auth.uid());

-- Deliberately no update/delete policy for any client role -> immutable once written, for
-- every role except service_role (which bypasses RLS and is never used to edit this table by
-- this codebase).
