-- Colega for Teams — Phase 3: secure invitation-based membership, replacing direct admin-add.
-- Run this against the same Supabase project that already has 0001-0009 applied. Additive except
-- for the two RLS policy changes on organization_members explicitly called out below (both close
-- real security gaps, not incidental cleanup).
--
-- ============================================================================
-- WHY THIS MIGRATION EXISTS
-- ============================================================================
-- 0007_organizations.sql's original organization_members INSERT policy let any org admin/owner
-- INSERT an arbitrary user's row directly:
--   create policy "admin or owner can add members" on organization_members for insert
--     with check (is_org_admin(org_id));
-- OrganizationService.addMemberByUsername (pre-Phase-3) called exactly that from the renderer —
-- an admin typing a username silently created real membership with zero action from the target
-- user. This is the bypass Phase 3 exists to close: consent must be required, not merely offered
-- by the UI (a Member scripting the same Supabase client call could otherwise create the exact
-- same unwanted membership regardless of what buttons the UI shows).
--
-- Fix: DROP that INSERT policy entirely (see bottom of this file) — after this migration,
-- organization_members has NO client-facing INSERT policy at all, so a direct `.insert()` call
-- from any authenticated client is denied outright. The only two ways a row can ever be created
-- are (a) create_organization()'s existing SECURITY DEFINER insert (the creator's own owner row —
-- unchanged, untouched by this migration) and (b) accept_organization_invitation() below (also
-- SECURITY DEFINER) — both run as the function owner, bypassing RLS by design, not by a hole in it.
--
-- ============================================================================
-- INVITATION LIFECYCLE
-- ============================================================================
--   pending -> accepted   (accept_organization_invitation, by the invited user only)
--   pending -> declined   (decline_organization_invitation, by the invited user only)
--   pending -> cancelled  (cancel_organization_invitation, by an org admin/owner only)
-- A pending invitation grants ZERO organization access on its own — only a row in
-- organization_members (created solely by accept_organization_invitation) establishes membership;
-- every existing Phase 2 Company-context/RLS check keys off organization_members, unchanged, so
-- this migration doesn't need to touch org_knowledge_items/get_org_ai_context/get_org_knowledge_summary
-- at all — a pending or declined invitation already fails every is_org_member() check those rely on.

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  -- Never 'owner' — inviting someone directly as Owner would be an ownership-transfer bypass,
  -- and this product doesn't implement ownership transfer yet (spec §18/§44). Only an existing
  -- org admin/owner may send an invitation (enforced in send_organization_invitation below), so
  -- allowing 'admin' here is not a privilege escalation beyond what updateMemberRole already lets
  -- an admin do to an EXISTING member.
  role text not null check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- Spec §15 — at most one PENDING invitation per (organization, invited user). A partial unique
-- index (not a plain unique constraint) so a user can be re-invited after a decline/cancellation
-- without deleting history.
create unique index if not exists organization_invitations_pending_unique
  on public.organization_invitations (organization_id, invited_user_id)
  where status = 'pending';

create index if not exists organization_invitations_invited_user_idx on public.organization_invitations (invited_user_id);
create index if not exists organization_invitations_org_idx on public.organization_invitations (organization_id, status);

alter table public.organization_invitations enable row level security;

-- SELECT only — see the header comment above for why there are deliberately NO insert/update/
-- delete policies on this table at all; every mutation goes through a SECURITY DEFINER RPC below.
-- Spec §30/§51 — the invited user reads invitations addressed to THEM; an org admin/owner reads
-- their own organization's invitations (for the Pending Invitations list); nobody else can read
-- anything here, so User A can never enumerate User B's invitations by id or otherwise.
drop policy if exists "target user or org admin can read invitations" on public.organization_invitations;
create policy "target user or org admin can read invitations"
  on public.organization_invitations for select
  using (invited_user_id = auth.uid() or public.is_org_admin(organization_id));

-- ============================================================================
-- send_organization_invitation — the ONLY way a pending invitation is created. Spec §5 (admin/
-- owner only, enforced here not just in the UI), §4 (exact-username lookup only, never a
-- directory), §15 (duplicate-pending guard), §16 (already-a-member guard — this also naturally
-- covers §17's self-invite case, since the inviter is themselves already a member of the org
-- they're admin of), §18 (role allowlisted by the column CHECK constraint above AND re-validated
-- here for a clean error before hitting a raw constraint violation).
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

  -- Exact username match only (spec §4: "do not build a searchable global directory").
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

  insert into public.organization_invitations (organization_id, invited_user_id, invited_by_user_id, role)
  values (target_org_id, target_user.id, auth.uid(), target_role)
  returning * into new_invitation;

  return new_invitation;
exception
  when unique_violation then
    -- Race: two simultaneous invites to the same user resolved by the partial unique index above.
    raise exception 'ALREADY_PENDING';
end;
$$;

revoke all on function public.send_organization_invitation(uuid, text, text) from public;
revoke all on function public.send_organization_invitation(uuid, text, text) from anon;
grant execute on function public.send_organization_invitation(uuid, text, text) to authenticated;

-- ============================================================================
-- accept_organization_invitation — spec §11 (atomic: locks the row, verifies ownership/status/
-- org existence, then creates membership and marks accepted in one transaction — never a partial
-- state), §12 (idempotent: accepting an already-accepted invitation just re-confirms membership
-- exists rather than erroring, and the membership insert itself is ON CONFLICT DO NOTHING against
-- organization_members' existing (org_id, user_id) primary key), §51 (a mismatched or
-- non-existent invitation id raises the SAME 'INVITATION_NOT_FOUND' regardless of which is true,
-- so User B can never distinguish "doesn't exist" from "exists but isn't mine" — no enumeration).
-- ============================================================================

create or replace function public.accept_organization_invitation(target_invitation_id uuid)
returns table (organization_id uuid, organization_name text, role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.organization_invitations;
  org_name text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into inv from public.organization_invitations where id = target_invitation_id for update;

  if inv is null or inv.invited_user_id != auth.uid() then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if inv.status = 'accepted' then
    -- Idempotent re-accept (double click / retry / two open windows, spec §12) — ensure the
    -- membership row exists (it should already) and return success rather than erroring.
    insert into public.organization_members (org_id, user_id, role)
    values (inv.organization_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
  elsif inv.status != 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  else
    if not exists (select 1 from public.organizations o where o.id = inv.organization_id and o.archived_at is null) then
      raise exception 'ORGANIZATION_NOT_FOUND';
    end if;

    insert into public.organization_members (org_id, user_id, role)
    values (inv.organization_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;

    update public.organization_invitations set status = 'accepted', responded_at = now() where id = target_invitation_id;
  end if;

  select o.name into org_name from public.organizations o where o.id = inv.organization_id;
  return query select inv.organization_id, org_name, inv.role;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid) from public;
revoke all on function public.accept_organization_invitation(uuid) from anon;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

-- ============================================================================
-- decline_organization_invitation — spec §13. Only the invited user; only ever moves a PENDING
-- invitation to declined. Any other current status is left untouched and treated as an idempotent
-- no-op (declining something already resolved isn't an attack surface, just a harmless race).
-- ============================================================================

create or replace function public.decline_organization_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.organization_invitations;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into inv from public.organization_invitations where id = target_invitation_id for update;

  if inv is null or inv.invited_user_id != auth.uid() then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if inv.status = 'pending' then
    update public.organization_invitations set status = 'declined', responded_at = now() where id = target_invitation_id;
  end if;
end;
$$;

revoke all on function public.decline_organization_invitation(uuid) from public;
revoke all on function public.decline_organization_invitation(uuid) from anon;
grant execute on function public.decline_organization_invitation(uuid) to authenticated;

-- ============================================================================
-- cancel_organization_invitation — spec §14. Only an org admin/owner of THAT invitation's
-- organization; only ever moves a PENDING invitation to cancelled — never touches an already
-- accepted invitation's resulting membership (that's removeMember's job, a separate action).
-- ============================================================================

create or replace function public.cancel_organization_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.organization_invitations;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into inv from public.organization_invitations where id = target_invitation_id for update;

  if inv is null then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if not public.is_org_admin(inv.organization_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if inv.status = 'pending' then
    update public.organization_invitations set status = 'cancelled', responded_at = now() where id = target_invitation_id;
  end if;
end;
$$;

revoke all on function public.cancel_organization_invitation(uuid) from public;
revoke all on function public.cancel_organization_invitation(uuid) from anon;
grant execute on function public.cancel_organization_invitation(uuid) to authenticated;

-- ============================================================================
-- organization_members — close the direct-add bypass (see header comment) and two further Owner-
-- safety hardenings audited under spec §19/§44:
--   1. No client-facing INSERT policy at all any more (was: any admin/owner could insert anyone).
--   2. UPDATE (role change) can never set role to 'owner' — ownership transfer isn't implemented
--      in this phase, so the safe default is to block it at the database level, not just by the
--      Members UI's role <select> not offering "Owner" as an option.
--   3. DELETE (leave/remove) can never remove the organization's SOLE owner — otherwise an
--      organization could be silently orphaned (spec §44: "if Owner transfer is not implemented,
--      block Owner leave"). A non-sole owner (a future multi-owner scenario) or any other role can
--      still leave/be removed as before.
-- ============================================================================

drop policy if exists "admin or owner can add members" on public.organization_members;
-- Deliberately no replacement INSERT policy — see header comment.

create or replace function public.is_sole_owner(target_org_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.organization_members m
      where m.org_id = target_org_id and m.user_id = target_user_id and m.role = 'owner'
    )
    and (
      select count(*) from public.organization_members m2
      where m2.org_id = target_org_id and m2.role = 'owner'
    ) <= 1;
$$;

revoke all on function public.is_sole_owner(uuid, uuid) from public;
revoke all on function public.is_sole_owner(uuid, uuid) from anon;
grant execute on function public.is_sole_owner(uuid, uuid) to authenticated;

drop policy if exists "admin or owner can change a member's role" on public.organization_members;
create policy "admin or owner can change a member's role (never to owner)"
  on public.organization_members for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id) and role in ('admin', 'member'));

drop policy if exists "member can leave, admin or owner can remove anyone" on public.organization_members;
create policy "member can leave, admin or owner can remove anyone (never the sole owner)"
  on public.organization_members for delete
  using (
    (auth.uid() = user_id or public.is_org_admin(org_id))
    and not public.is_sole_owner(org_id, user_id)
  );
