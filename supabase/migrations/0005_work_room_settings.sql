-- Colega Work Rooms — Room Settings (Phase C): profile fields (description/icon), a secure
-- rename/profile-update RPC, a secure owner-only delete RPC, and an owner-orphan-prevention fix
-- to the existing membership DELETE policy. Run this against the same Supabase project that
-- already has 0001-0004 applied (SQL Editor -> paste -> Run). Does not edit any already-applied
-- migration file — only adds columns/functions and REPLACES two specific policies at runtime
-- (the standard, safe way to evolve RLS across migrations; the 0001/0002 FILES are untouched).
--
-- ============================================================================
-- 1. Room profile fields
-- ============================================================================
-- Lightweight identity fields only — no file storage/upload system. `icon` is a short local
-- emoji/text glyph, never an uploaded image.
alter table public.work_rooms add column if not exists description text;
alter table public.work_rooms add column if not exists icon text;

alter table public.work_rooms drop constraint if exists work_rooms_description_length;
alter table public.work_rooms add constraint work_rooms_description_length check (description is null or char_length(description) <= 500);

alter table public.work_rooms drop constraint if exists work_rooms_icon_length;
alter table public.work_rooms add constraint work_rooms_icon_length check (icon is null or char_length(icon) <= 8);

-- ============================================================================
-- 2. Rename/profile-update RPC — replaces direct client UPDATE access to work_rooms entirely
-- ============================================================================
-- 0001's "owner can update their room" policy allowed the owner to UPDATE ANY column via a
-- raw REST call, including owner_id itself — nothing in the app ever exercised that (no rename/
-- archive UI existed yet), but it's a latent hole now that Room Settings needs a real rename
-- path: a raw multi-column UPDATE grant can't be restricted to "only name/description/icon"
-- through RLS alone (USING/WITH CHECK operate on whole rows, not individual columns). Dropping
-- the blanket policy and routing every post-creation change through this narrow, SECURITY
-- DEFINER RPC means the client can never touch owner_id/id/created_at, only what this function
-- explicitly allows.
drop policy if exists "owner can update their room" on public.work_rooms;

create or replace function public.update_work_room_profile(
  room_id uuid,
  new_name text,
  new_description text default null,
  new_icon text default null
)
returns public.work_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed_name text := trim(new_name);
  updated_room public.work_rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not exists (select 1 from public.work_rooms r where r.id = room_id and r.owner_id = auth.uid()) then
    raise exception 'Only the room owner can update this room.' using errcode = '42501';
  end if;

  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 80 then
    raise exception 'Room name must be between 1 and 80 characters.' using errcode = '22023';
  end if;
  if new_description is not null and char_length(new_description) > 500 then
    raise exception 'Description must be 500 characters or fewer.' using errcode = '22023';
  end if;
  if new_icon is not null and char_length(new_icon) > 8 then
    raise exception 'Icon must be 8 characters or fewer.' using errcode = '22023';
  end if;

  update public.work_rooms
  set name = trimmed_name,
      description = new_description,
      icon = new_icon
  where id = room_id
  returning * into updated_room;

  return updated_room;
end;
$$;

revoke all on function public.update_work_room_profile(uuid, text, text, text) from public;
revoke all on function public.update_work_room_profile(uuid, text, text, text) from anon;
grant execute on function public.update_work_room_profile(uuid, text, text, text) to authenticated;

-- ============================================================================
-- 3. Delete RPC — owner-only, atomic; relies on the ALREADY-CORRECT cascades from 0001
-- ============================================================================
-- Cascade review (spec section 19): work_room_members.room_id, work_room_invites.room_id,
-- work_room_messages.room_id, and work_room_ai_state.room_id (its own primary key) were ALL
-- already declared `references public.work_rooms(id) on delete cascade` back in 0001 — deleting
-- the work_rooms row already correctly removes every dependent row with no orphans and no
-- unrelated deletions. This function does not need to (and does not) touch those tables itself.
--
-- There was never a DELETE policy on work_rooms (RLS defaults to deny), so a plain client
-- DELETE has always been rejected; this RPC is the only path, and it enforces ownership itself
-- rather than depending on a permissive policy.
create or replace function public.delete_work_room(room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not exists (select 1 from public.work_rooms r where r.id = room_id and r.owner_id = auth.uid()) then
    raise exception 'Only the room owner can delete this room.' using errcode = '42501';
  end if;

  delete from public.work_rooms where id = room_id;
end;
$$;

revoke all on function public.delete_work_room(uuid) from public;
revoke all on function public.delete_work_room(uuid) from anon;
grant execute on function public.delete_work_room(uuid) to authenticated;

-- ============================================================================
-- 4. Owner-orphan prevention: the owner must never be able to remove their OWN membership row
-- ============================================================================
-- 0002's DELETE policy on work_room_members was `auth.uid() = user_id OR is_work_room_owner(...)`
-- — which technically let an owner delete their OWN membership row via the first clause. Since
-- work_rooms/messages/etc. are only visible to MEMBERS, that would silently lock the owner out
-- of a room they still nominally own, with no member left to fix it (spec section 21: "If
-- ownership transfer is not implemented, owner cannot leave; owner can delete room."). This
-- replaces that policy with the same behavior EXCEPT the owner's own row is never a valid
-- target — self-leave still works for every non-owner member, and the owner can still remove
-- (kick) any OTHER member.
drop policy if exists "owner can remove members, members can remove themselves" on public.work_room_members;
create policy "members can leave, except the owner - owner can remove others"
  on public.work_room_members for delete
  using (
    not (auth.uid() = user_id and public.is_work_room_owner(room_id))
    and (auth.uid() = user_id or public.is_work_room_owner(room_id))
  );
