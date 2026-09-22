-- Colega Work Rooms — fix RLS infinite recursion + close a membership-bootstrap hole.
-- Run this against the SAME Supabase project that already has 0001_work_rooms.sql applied
-- (SQL Editor -> paste -> Run, or `supabase db push`). It does not drop any table and does
-- not disable RLS anywhere — it only replaces the specific policies described below and adds
-- two small SECURITY DEFINER helper functions. Safe to re-run (every statement is idempotent).
--
-- ============================================================================
-- ROOT CAUSE
-- ============================================================================
-- 0001's "members can see the member list of their own rooms" policy on work_room_members
-- reads:
--
--   using (
--     exists (
--       select 1 from public.work_room_members self
--       where self.room_id = work_room_members.room_id and self.user_id = auth.uid()
--     )
--   )
--
-- This policy is ON work_room_members, and its own USING clause queries work_room_members
-- again (aliased "self"). Row Level Security does not know "self" is just a self-join for the
-- same permission check — it re-applies the identical SELECT policy to evaluate that inner
-- query, which re-triggers the same USING clause, which queries work_room_members again, and
-- so on. Postgres detects this and aborts with "infinite recursion detected in policy for
-- relation work_room_members" instead of looping forever.
--
-- This is the DIRECT recursion. It also produces INDIRECT recursion in every other policy
-- that checks room membership via `exists (select 1 from work_room_members ...)`:
--   work_rooms (select)          -> work_room_members (select, recursive) -> boom
--   work_room_invites (select)   -> work_room_members (select, recursive) -> boom
--   work_room_messages (*)       -> work_room_members (select, recursive) -> boom
--   work_room_ai_state (*)       -> work_room_members (select, recursive) -> boom
-- which is exactly why the real runtime log shows the error on listMyRooms (a direct
-- work_room_members query), listMyInvites (goes through work_room_invites -> work_room_members),
-- and room creation (work_room_members insert triggers its own broken select policy to check
-- the insert result, plus later selects re-hit it).
--
-- FIX: a SECURITY DEFINER helper function evaluates room membership with RLS bypassed for its
-- own internal query (the function runs as its owner, which owns/bypasses RLS on these tables —
-- the same, documented Supabase pattern for exactly this class of bug). Every policy that used
-- to inline `exists (select 1 from work_room_members ...)` now calls that function instead, so
-- there is no longer any RLS-enabled query nested inside another RLS check on the same table.
--
-- ============================================================================
-- SECOND, INDEPENDENT BUG: membership-bootstrap hole (not a recursion bug, a security hole)
-- ============================================================================
-- 0001's insert policy on work_room_members:
--
--   with check (
--     auth.uid() = (select owner_id from public.work_rooms where id = room_id)
--     or auth.uid() = user_id
--   )
--
-- The second clause, `auth.uid() = user_id`, allows ANY signed-in user to insert a
-- work_room_members row for THEMSELVES into ANY room_id, with ANY role (including 'owner'),
-- whether or not they own that room, are already a member, or were ever invited. In practice
-- the app never exploited this (it only self-inserts as 'member' when accepting a real pending
-- invite), but the database itself did not enforce that — the policy trusted the client not to
-- send anything else. This migration replaces it with a check that only allows:
--   1. the real room owner (checked against work_rooms.owner_id, auth.uid() — including
--      immediately after that same transaction's INSERT into work_rooms, which is what lets a
--      room creator bootstrap their own owner membership row), or
--   2. a user accepting their own pending invite (auth.uid() = user_id = invitee on a real,
--      pending public.work_room_invites row for that room).
--
-- ============================================================================
-- SECURITY DEFINER helper functions
-- ============================================================================
-- public.is_work_room_member(uuid) / public.is_work_room_owner(uuid):
--   * take the target room id as their ONLY input — never a user id from the caller, so a
--     renderer can never ask "is someone else a member of this room."
--   * always resolve identity via auth.uid() (server-side, from the verified JWT) — never a
--     client-supplied user id.
--   * return a single boolean — they expose no rows, no other members' identities.
--   * are `security definer` with `set search_path = public, pg_temp` fixed, so they can't be
--     hijacked by a session-level search_path change and always resolve `public.*` correctly.
--   * are `stable`, not `volatile` — they only read.
--   * have EXECUTE revoked from PUBLIC/anon and granted only to `authenticated`.

create or replace function public.is_work_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work_room_members m
    where m.room_id = target_room_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_work_room_member(uuid) from public;
revoke all on function public.is_work_room_member(uuid) from anon;
grant execute on function public.is_work_room_member(uuid) to authenticated;

create or replace function public.is_work_room_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work_rooms r
    where r.id = target_room_id
      and r.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_work_room_owner(uuid) from public;
revoke all on function public.is_work_room_owner(uuid) from anon;
grant execute on function public.is_work_room_owner(uuid) to authenticated;

-- ============================================================================
-- work_rooms — read policy now goes through the helper (was already non-recursive on its
-- own, but it transitively broke whenever the work_room_members policy below recursed).
-- ============================================================================
drop policy if exists "members can read their rooms" on public.work_rooms;
create policy "members can read their rooms"
  on public.work_rooms for select
  using (public.is_work_room_member(id));

-- insert/update policies are unchanged (auth.uid() = owner_id — never recursive, never touched
-- work_room_members), kept here only so this file fully re-describes work_rooms' RLS surface.
drop policy if exists "signed-in users can create a room (become its owner)" on public.work_rooms;
create policy "signed-in users can create a room (become its owner)"
  on public.work_rooms for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner can update their room" on public.work_rooms;
create policy "owner can update their room"
  on public.work_rooms for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ============================================================================
-- work_room_members — the actual recursion fix + the bootstrap-hole fix.
-- ============================================================================

-- SELECT: was self-referencing (the direct recursion). Now delegates to the SECURITY DEFINER
-- helper, which performs the identical "is auth.uid() a member of this room_id" check without
-- re-entering RLS on work_room_members.
drop policy if exists "members can see the member list of their own rooms" on public.work_room_members;
create policy "members can see the member list of their own rooms"
  on public.work_room_members for select
  using (public.is_work_room_member(room_id));

-- INSERT: closes the bootstrap hole. Exactly two ways a row can be created:
--   (a) the real owner of the room (from work_rooms.owner_id, auth.uid() — true the instant
--       after that room's own INSERT, in the same transaction, which is what lets a creator
--       bootstrap their own owner membership; also lets an owner add any other member directly).
--   (b) a user accepting their OWN pending invite: user_id must equal auth.uid(), the role must
--       be 'member' (accepting an invite never grants ownership), and a real pending
--       work_room_invites row for that exact room/invitee must exist.
-- User A can never insert an owner row for User B in a room A does not own: clause (a) requires
-- A to actually be that room's owner_id in work_rooms, and clause (b) can only ever insert
-- auth.uid() themself, never an arbitrary other user_id.
drop policy if exists "owner can add members" on public.work_room_members;
create policy "bootstrap owner or accept a real invite"
  on public.work_room_members for insert
  with check (
    public.is_work_room_owner(room_id)
    or (
      auth.uid() = user_id
      and role = 'member'
      and exists (
        select 1
        from public.work_room_invites i
        where i.room_id = work_room_members.room_id
          and i.invitee_id = auth.uid()
          and i.status = 'pending'
      )
    )
  );

-- DELETE: unchanged behavior (self-removal, or the owner removing anyone), rewritten through
-- the owner helper for consistency — never touched work_room_members, so it was never part of
-- the recursion.
drop policy if exists "owner can remove members, members can remove themselves" on public.work_room_members;
create policy "owner can remove members, members can remove themselves"
  on public.work_room_members for delete
  using (
    auth.uid() = user_id
    or public.is_work_room_owner(room_id)
  );

-- ============================================================================
-- work_room_invites — unchanged permissions, rewritten through the helper so this table no
-- longer nests a raw work_room_members query inside its own policy evaluation.
-- ============================================================================
drop policy if exists "inviter, invitee or room members can read an invite" on public.work_room_invites;
create policy "inviter, invitee or room members can read an invite"
  on public.work_room_invites for select
  using (
    auth.uid() = inviter_id
    or auth.uid() = invitee_id
    or public.is_work_room_member(room_id)
  );

drop policy if exists "room members can create invites" on public.work_room_invites;
create policy "room members can create invites"
  on public.work_room_invites for insert
  with check (
    auth.uid() = inviter_id
    and public.is_work_room_member(room_id)
  );

-- update policy unchanged/not recursive; restated for completeness.
drop policy if exists "invitee can respond, inviter can revoke" on public.work_room_invites;
create policy "invitee can respond, inviter can revoke"
  on public.work_room_invites for update
  using (auth.uid() = invitee_id or auth.uid() = inviter_id)
  with check (auth.uid() = invitee_id or auth.uid() = inviter_id);

-- ============================================================================
-- work_room_messages — unchanged permissions, rewritten through the helper.
-- ============================================================================
drop policy if exists "room members can read messages" on public.work_room_messages;
create policy "room members can read messages"
  on public.work_room_messages for select
  using (public.is_work_room_member(room_id));

drop policy if exists "room members can post human messages as themselves" on public.work_room_messages;
create policy "room members can post human messages as themselves"
  on public.work_room_messages for insert
  with check (
    public.is_work_room_member(room_id)
    and (
      (sender_type = 'human' and sender_user_id = auth.uid())
      or sender_type in ('ai', 'system')
    )
  );

-- ============================================================================
-- work_room_ai_state — unchanged permissions, rewritten through the helper.
-- ============================================================================
drop policy if exists "room members can read AI state" on public.work_room_ai_state;
create policy "room members can read AI state"
  on public.work_room_ai_state for select
  using (public.is_work_room_member(room_id));

drop policy if exists "room members can upsert AI state" on public.work_room_ai_state;
create policy "room members can upsert AI state"
  on public.work_room_ai_state for insert
  with check (public.is_work_room_member(room_id));

drop policy if exists "room members can update AI state" on public.work_room_ai_state;
create policy "room members can update AI state"
  on public.work_room_ai_state for update
  using (public.is_work_room_member(room_id))
  with check (public.is_work_room_member(room_id));
