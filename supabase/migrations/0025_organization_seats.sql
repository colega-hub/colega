-- Colega Teams — seat-limited membership. Run against the same Supabase project that already has
-- 0001-0024 applied. Additive: one new table, three new functions, one new trigger, and a
-- re-definition of send_organization_invitation() (0010) that is identical except for the added
-- seat check. No existing policy is dropped or widened; no existing row is changed.
--
-- ============================================================================
-- COMMERCIAL MODEL THIS ENCODES
-- ============================================================================
-- Teams base plan includes 3 seats; additional seats are purchased separately. Every row in
-- organization_members — owner, admin or member — occupies one seat. A company can never hold
-- more ACTIVE members than it owns seats.
--
--   seat_limit      = included_seats + additional_seats   (no entitlement row yet = 3 + 0)
--   seats_used      = count(organization_members)          (owner/admin/member alike)
--   seats_reserved  = count(pending organization_invitations)
--   seats_available = greatest(0, seat_limit - seats_used - seats_reserved)
--
-- Pending invitations RESERVE a seat at send time, so an admin can't hand out more invitations
-- than seats and leave invitees to discover at accept time that the company is full. The HARD
-- limit, though, is on membership itself (see the trigger below): even if a reservation was
-- somehow skipped, no insert path can ever make seats_used exceed seat_limit.
--
-- ============================================================================
-- WHERE THE SEAT COUNT LIVES, AND WHY NOT ON organizations
-- ============================================================================
-- organizations' UPDATE policy (0007) lets any owner/admin update EVERY column of their own
-- organization row — a seat_limit column there would be self-service for the very people it is
-- meant to limit. organization_seat_entitlements instead mirrors subscriptions (0014): members may
-- READ their company's row, and there is deliberately NO insert/update/delete policy for
-- authenticated/anon at all. Only service_role (a future billing webhook — Paddle, per
-- subscriptions' own billing_* columns) or the SQL editor can change it. Billing is NOT wired to
-- seat purchases yet; until it is, additional seats can only be granted by an operator, e.g.:
--
--   insert into public.organization_seat_entitlements (org_id, additional_seats, source)
--   values ('<org uuid>', 5, 'manual')
--   on conflict (org_id) do update set additional_seats = excluded.additional_seats,
--                                       source = excluded.source;
--
-- ============================================================================
-- ENFORCEMENT POINT (cannot be bypassed from the desktop client)
-- ============================================================================
-- organization_members has had NO client INSERT policy since 0010 — rows are created only by
-- SECURITY DEFINER functions (create_organization, create_organization_for_user,
-- accept_organization_invitation). A BEFORE INSERT trigger covers every one of those paths, and
-- any future one, in a single place:
--   1. `select ... from organizations where id = new.org_id for update` serializes every
--      concurrent membership insert for the SAME company on that company's row lock. Under READ
--      COMMITTED, the count below is a new statement, so it takes a fresh snapshot after the lock
--      is granted and sees every membership committed by the transaction that held it. Two
--      simultaneous accepts for the last seat: the second waits, then counts the first's row and
--      fails with SEAT_LIMIT_REACHED. Different companies never contend.
--   2. An already-existing (org_id, user_id) row is let through untouched, so
--      accept_organization_invitation's idempotent `on conflict do nothing` re-accept still works
--      for a company that is exactly full.
-- The trigger function is SECURITY DEFINER so its count is never narrowed by the caller's own RLS
-- view (an invitee accepting is not a member yet and could otherwise see zero rows).
--
-- Existing companies are grandfathered, never truncated: a company that already has more members
-- than seats keeps all of them, it just can't add more until members leave or seats are added.

create table if not exists public.organization_seat_entitlements (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  included_seats integer not null default 3 check (included_seats between 1 and 10000),
  additional_seats integer not null default 0 check (additional_seats between 0 and 10000),
  -- Informational provenance only ('manual', 'paddle', ...) — never read by any authorization
  -- decision below.
  source text,
  billing_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organization_seat_entitlements_set_updated_at on public.organization_seat_entitlements;
create trigger organization_seat_entitlements_set_updated_at
  before update on public.organization_seat_entitlements
  for each row execute function public.set_updated_at();

alter table public.organization_seat_entitlements enable row level security;

-- READ only, members of that company only. No write policy exists for authenticated/anon at all.
drop policy if exists "members can read their organization's seat entitlement" on public.organization_seat_entitlements;
create policy "members can read their organization's seat entitlement"
  on public.organization_seat_entitlements for select
  using (public.is_org_member(org_id));

-- ============================================================================
-- organization_seat_limit — internal helper, not callable by clients directly.
-- ============================================================================

create or replace function public.organization_seat_limit(target_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select e.included_seats + e.additional_seats from public.organization_seat_entitlements e where e.org_id = target_org_id),
    3
  );
$$;

revoke all on function public.organization_seat_limit(uuid) from public;
revoke all on function public.organization_seat_limit(uuid) from anon;
revoke all on function public.organization_seat_limit(uuid) from authenticated;

-- ============================================================================
-- get_organization_seat_usage — the one read path the desktop uses for "3 / 5 seats used".
-- Members of the company only; anyone else gets NOT_AUTHORIZED (no enumeration of other
-- companies' sizes).
-- ============================================================================

create or replace function public.get_organization_seat_usage(target_org_id uuid)
returns table (seat_limit integer, seats_used integer, seats_reserved integer, seats_available integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used integer;
  v_reserved integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_org_member(target_org_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  v_limit := public.organization_seat_limit(target_org_id);
  select count(*) into v_used from public.organization_members m where m.org_id = target_org_id;
  select count(*) into v_reserved from public.organization_invitations i where i.organization_id = target_org_id and i.status = 'pending';

  return query select v_limit, v_used, v_reserved, greatest(0, v_limit - v_used - v_reserved);
end;
$$;

revoke all on function public.get_organization_seat_usage(uuid) from public;
revoke all on function public.get_organization_seat_usage(uuid) from anon;
grant execute on function public.get_organization_seat_usage(uuid) to authenticated;

-- ============================================================================
-- The hard limit — see "ENFORCEMENT POINT" above.
-- ============================================================================

create or replace function public.enforce_organization_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  perform 1 from public.organizations o where o.id = new.org_id for update;

  if exists (select 1 from public.organization_members m where m.org_id = new.org_id and m.user_id = new.user_id) then
    return new; -- not a new seat; the caller's ON CONFLICT (or the PK) decides what happens
  end if;

  select count(*) into v_used from public.organization_members m where m.org_id = new.org_id;
  if v_used >= public.organization_seat_limit(new.org_id) then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_organization_seat_limit() from public;
revoke all on function public.enforce_organization_seat_limit() from anon;
revoke all on function public.enforce_organization_seat_limit() from authenticated;

drop trigger if exists organization_members_enforce_seat_limit on public.organization_members;
create trigger organization_members_enforce_seat_limit
  before insert on public.organization_members
  for each row execute function public.enforce_organization_seat_limit();

-- ============================================================================
-- send_organization_invitation — identical to 0010 except for the seat reservation check (under
-- the same company row lock the trigger uses, so two admins racing for the last seat can't both
-- get an invitation out). Checked AFTER the user-facing validation errors so an invalid username
-- still reports USER_NOT_FOUND rather than a misleading "company is full".
-- ============================================================================

create or replace function public.send_organization_invitation(target_org_id uuid, target_username text, target_role text)
returns public.organization_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_username text := lower(trim(target_username));
  target_user record;
  new_invitation public.organization_invitations;
  v_used integer;
  v_reserved integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not public.is_org_admin(target_org_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if target_role not in ('admin', 'member') then
    raise exception 'INVALID_ROLE';
  end if;

  if normalized_username = '' then
    raise exception 'USER_NOT_FOUND';
  end if;

  select id into target_user from public.profiles where username = normalized_username;
  if target_user is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.organization_members m where m.org_id = target_org_id and m.user_id = target_user.id
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  if exists (
    select 1 from public.organization_invitations i
    where i.organization_id = target_org_id and i.invited_user_id = target_user.id and i.status = 'pending'
  ) then
    raise exception 'ALREADY_PENDING';
  end if;

  perform 1 from public.organizations o where o.id = target_org_id for update;
  select count(*) into v_used from public.organization_members m where m.org_id = target_org_id;
  select count(*) into v_reserved from public.organization_invitations i where i.organization_id = target_org_id and i.status = 'pending';
  if v_used + v_reserved >= public.organization_seat_limit(target_org_id) then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  insert into public.organization_invitations (organization_id, invited_user_id, invited_by_user_id, role)
  values (target_org_id, target_user.id, auth.uid(), target_role)
  returning * into new_invitation;

  return new_invitation;
exception
  when unique_violation then
    raise exception 'ALREADY_PENDING';
end;
$$;

revoke all on function public.send_organization_invitation(uuid, text, text) from public;
revoke all on function public.send_organization_invitation(uuid, text, text) from anon;
grant execute on function public.send_organization_invitation(uuid, text, text) to authenticated;
