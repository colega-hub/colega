-- Colega Work Rooms — fix "new row violates row-level security policy for table work_rooms"
-- on room creation. Run this against the SAME Supabase project that already has 0001 and 0002
-- applied (SQL Editor -> paste -> Run). It does not drop any table, does not disable RLS, and
-- does not weaken any existing policy — it only adds one narrowly-scoped SECURITY DEFINER
-- function and changes what the client calls to create a room. Safe to re-run.
--
-- ============================================================================
-- ROOT CAUSE (traced against the real schema/policies, not guessed)
-- ============================================================================
-- WorkRoomService.createRoom() did this as two separate client requests:
--
--   1. INSERT into work_rooms (name, owner_id) ... .select().single()   <- RETURNING *
--   2. INSERT into work_room_members (room_id, user_id, role: 'owner')
--
-- Step 1's INSERT itself is fine: work_rooms' INSERT policy is `with check (auth.uid() =
-- owner_id)`, and owner_id IS auth.uid(), so the WITH CHECK passes and the row is created.
--
-- The failure is in `.select()` on that same call, which becomes `RETURNING *` in the actual
-- SQL PostgREST sends. Postgres filters a RETURNING row through the table's SELECT policy
-- before handing it back — and work_rooms' SELECT policy (both in 0001 and after the 0002
-- recursion fix) is:
--
--   using (public.is_work_room_member(id))   -- i.e. "auth.uid() is in work_room_members for
--                                                this room_id"
--
-- At the exact moment Postgres evaluates that check for the RETURNING row, step 2 (the
-- work_room_members INSERT) has NOT happened yet — it's a separate, later request. So the
-- brand new room has zero rows in work_room_members, `is_work_room_member(id)` is false, the
-- row fails the SELECT policy, and Postgres raises the row-security violation on the INSERT's
-- RETURNING clause. This is documented Postgres/Supabase behavior for exactly this shape of
-- bug (an INSERT ... RETURNING against a row that the table's own SELECT policy would hide) —
-- see Supabase's own storage-upload troubleshooting doc for the identical pattern.
--
-- This is a genuine bootstrap / chicken-and-egg problem: a room can only be *read* by a member,
-- but nothing can become a member until the room exists, and the two inserts happening as two
-- separate, non-transactional client requests means there is no way to make the room visible to
-- its own creator without either (a) also making it visible to non-members (weakens security),
-- or (b) doing both inserts inside one privileged, atomic operation. This migration takes (b).
--
-- ============================================================================
-- CHOSEN FIX: a single SECURITY DEFINER RPC, not a broader SELECT policy
-- ============================================================================
-- An alternative would be widening work_rooms' SELECT policy to
-- `is_work_work_member(id) or owner_id = auth.uid()`. That fixes the RETURNING visibility gap,
-- but leaves the underlying two-request flow non-atomic: if the client crashes or loses network
-- between step 1 and step 2, a room is created with NO members at all — permanently orphaned
-- (nobody, including its "owner", could ever add a member to it again through the normal
-- invite/self-accept path, since none of that path applies to a room the caller isn't yet a
-- member of). That's a real, observable failure mode, not a hypothetical.
--
-- public.create_work_room(text) instead does both inserts inside ONE function call, which
-- Postgres runs as a single transaction: if the membership insert fails for any reason, the
-- room insert is rolled back too — there is no partially-created state to reach. It:
--   * takes ONLY a room name — never an owner/user id from the caller, so User A can never
--     nominate User B (or themselves under a different id) as the room's owner.
--   * resolves identity exclusively via auth.uid() (raises if there is no authenticated user).
--   * validates the room name against the exact same constraint work_rooms already enforces
--     (1-80 trimmed characters) so it can't be used to bypass that check.
--   * is `security definer` with a fixed `search_path`, so its internal inserts run with the
--     function owner's privileges (bypassing RLS for those two specific, already-authorized
--     inserts) regardless of session-level search_path tampering.
--   * returns the created room directly (no RETURNING-through-RLS step, so no repeat of the
--     bug this migration fixes).
--   * has EXECUTE revoked from PUBLIC/anon and granted only to `authenticated` — an
--     unauthenticated caller cannot invoke it at all (defense in depth on top of the auth.uid()
--     check inside).
-- It does not touch any existing RLS policy — work_rooms/work_room_members visibility rules
-- from 0001/0002 are unchanged for every other read/write path (listing rooms, invites,
-- messages, AI state, membership management).

create or replace function public.create_work_room(room_name text)
returns public.work_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed_name text := trim(room_name);
  new_room public.work_rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  -- Mirrors work_rooms.name's own check constraint (char_length(trim(name)) between 1 and 80)
  -- so this function can't be used to insert a room name the table itself would reject.
  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 80 then
    raise exception 'Room name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  insert into public.work_rooms (name, owner_id)
  values (trimmed_name, auth.uid())
  returning * into new_room;

  insert into public.work_room_members (room_id, user_id, role)
  values (new_room.id, auth.uid(), 'owner');

  return new_room;
end;
$$;

revoke all on function public.create_work_room(text) from public;
revoke all on function public.create_work_room(text) from anon;
grant execute on function public.create_work_room(text) to authenticated;
