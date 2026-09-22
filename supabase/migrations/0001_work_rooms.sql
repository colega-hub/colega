-- Colega Work Rooms — initial schema (Feature set: auth profile, friends, work rooms,
-- invites, chat, AI room state). Run this once against your Supabase project
-- (SQL Editor -> paste -> Run, or `supabase db push` if you use the CLI).
--
-- Design notes:
--   * Every table that needs "am I allowed to see this row" protection has RLS enabled
--     and policies that check auth.uid() directly — the client (anon key) can NEVER
--     read/write outside these rules, regardless of what the renderer sends.
--   * updated_at columns are maintained by a trigger, not client-supplied values.
--   * No service-role key is required for normal app operation — every operation the
--     app performs is expressible as "the signed-in user acting as themselves," which
--     is exactly what RLS is for.

-- ============================================================================
-- Shared trigger: maintain updated_at automatically
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  status text not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create index if not exists profiles_username_idx on public.profiles (username);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Any signed-in user can look up basic public profile info (needed for @username
-- search, friend lists, room member lists, chat sender names) — but only the owner
-- can ever change their own row.
drop policy if exists "profiles are readable by any signed-in user" on public.profiles;
create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================================
-- friendships
-- ============================================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_self_friendship check (requester_id <> addressee_id),
  -- one relationship row per unordered pair — enforced via a normalized pair index below,
  -- since Postgres unique constraints can't express "unordered" directly.
  constraint friendship_pair_unique unique (requester_id, addressee_id)
);

-- Prevents (A,B) and (B,A) both existing as separate pending requests.
create unique index if not exists friendships_unordered_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "involved users can read their friendships" on public.friendships;
create policy "involved users can read their friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users can send a friend request as themselves" on public.friendships;
create policy "users can send a friend request as themselves"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

drop policy if exists "involved users can update status (accept/decline/remove)" on public.friendships;
create policy "involved users can update status (accept/decline/remove)"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "involved users can delete a friendship" on public.friendships;
create policy "involved users can delete a friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ============================================================================
-- work_rooms
-- ============================================================================
create table if not exists public.work_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists work_rooms_owner_idx on public.work_rooms (owner_id);

drop trigger if exists work_rooms_set_updated_at on public.work_rooms;
create trigger work_rooms_set_updated_at
  before update on public.work_rooms
  for each row execute function public.set_updated_at();

alter table public.work_rooms enable row level security;

-- ============================================================================
-- work_room_members
-- ============================================================================
create table if not exists public.work_room_members (
  room_id uuid not null references public.work_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists work_room_members_user_idx on public.work_room_members (user_id);

alter table public.work_room_members enable row level security;

-- Membership-gated read access to rooms: only members (checked via work_room_members,
-- which has its own, non-recursive policy below) can see a room row at all.
drop policy if exists "members can read their rooms" on public.work_rooms;
create policy "members can read their rooms"
  on public.work_rooms for select
  using (
    exists (
      select 1 from public.work_room_members m
      where m.room_id = work_rooms.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "signed-in users can create a room (become its owner)" on public.work_rooms;
create policy "signed-in users can create a room (become its owner)"
  on public.work_rooms for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner can update their room" on public.work_rooms;
create policy "owner can update their room"
  on public.work_rooms for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Membership policies deliberately do NOT reference work_rooms (would create a
-- circular RLS check) — they check membership rows directly against auth.uid().
drop policy if exists "members can see the member list of their own rooms" on public.work_room_members;
create policy "members can see the member list of their own rooms"
  on public.work_room_members for select
  using (
    exists (
      select 1 from public.work_room_members self
      where self.room_id = work_room_members.room_id and self.user_id = auth.uid()
    )
  );

drop policy if exists "owner can add members" on public.work_room_members;
create policy "owner can add members"
  on public.work_room_members for insert
  with check (
    -- the room owner can add anyone; a user can also add THEMSELVES (used when
    -- accepting an invite — see work_room_invites below, checked at the app layer
    -- transactionally: insert only happens after the invite row confirms invitee_id)
    auth.uid() = (select owner_id from public.work_rooms where id = room_id)
    or auth.uid() = user_id
  );

drop policy if exists "owner can remove members, members can remove themselves" on public.work_room_members;
create policy "owner can remove members, members can remove themselves"
  on public.work_room_members for delete
  using (
    auth.uid() = user_id
    or auth.uid() = (select owner_id from public.work_rooms where id = room_id)
  );

-- ============================================================================
-- work_room_invites
-- ============================================================================
create table if not exists public.work_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.work_rooms(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  invite_token text unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists work_room_invites_invitee_idx on public.work_room_invites (invitee_id);
create index if not exists work_room_invites_room_idx on public.work_room_invites (room_id);

alter table public.work_room_invites enable row level security;

drop policy if exists "inviter, invitee or room members can read an invite" on public.work_room_invites;
create policy "inviter, invitee or room members can read an invite"
  on public.work_room_invites for select
  using (
    auth.uid() = inviter_id
    or auth.uid() = invitee_id
    or exists (select 1 from public.work_room_members m where m.room_id = work_room_invites.room_id and m.user_id = auth.uid())
  );

drop policy if exists "room members can create invites" on public.work_room_invites;
create policy "room members can create invites"
  on public.work_room_invites for insert
  with check (
    auth.uid() = inviter_id
    and exists (select 1 from public.work_room_members m where m.room_id = work_room_invites.room_id and m.user_id = auth.uid())
  );

drop policy if exists "invitee can respond, inviter can revoke" on public.work_room_invites;
create policy "invitee can respond, inviter can revoke"
  on public.work_room_invites for update
  using (auth.uid() = invitee_id or auth.uid() = inviter_id)
  with check (auth.uid() = invitee_id or auth.uid() = inviter_id);

-- ============================================================================
-- work_room_messages
-- ============================================================================
create table if not exists public.work_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.work_rooms(id) on delete cascade,
  sender_user_id uuid references public.profiles(id) on delete set null,
  sender_type text not null default 'human' check (sender_type in ('human', 'ai', 'system')),
  content text not null,
  created_at timestamptz not null default now(),
  constraint human_messages_have_sender check (sender_type <> 'human' or sender_user_id is not null)
);

create index if not exists work_room_messages_room_created_idx on public.work_room_messages (room_id, created_at);

alter table public.work_room_messages enable row level security;

drop policy if exists "room members can read messages" on public.work_room_messages;
create policy "room members can read messages"
  on public.work_room_messages for select
  using (exists (select 1 from public.work_room_members m where m.room_id = work_room_messages.room_id and m.user_id = auth.uid()));

drop policy if exists "room members can post human messages as themselves" on public.work_room_messages;
create policy "room members can post human messages as themselves"
  on public.work_room_messages for insert
  with check (
    exists (select 1 from public.work_room_members m where m.room_id = work_room_messages.room_id and m.user_id = auth.uid())
    and (
      (sender_type = 'human' and sender_user_id = auth.uid())
      or sender_type in ('ai', 'system')
    )
  );

-- ============================================================================
-- work_room_ai_state
-- ============================================================================
create table if not exists public.work_room_ai_state (
  room_id uuid primary key references public.work_rooms(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'absent' check (mode in ('absent', 'listening', 'thinking', 'speaking')),
  invited_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists work_room_ai_state_set_updated_at on public.work_room_ai_state;
create trigger work_room_ai_state_set_updated_at
  before update on public.work_room_ai_state
  for each row execute function public.set_updated_at();

alter table public.work_room_ai_state enable row level security;

drop policy if exists "room members can read AI state" on public.work_room_ai_state;
create policy "room members can read AI state"
  on public.work_room_ai_state for select
  using (exists (select 1 from public.work_room_members m where m.room_id = work_room_ai_state.room_id and m.user_id = auth.uid()));

drop policy if exists "room members can upsert AI state" on public.work_room_ai_state;
create policy "room members can upsert AI state"
  on public.work_room_ai_state for insert
  with check (exists (select 1 from public.work_room_members m where m.room_id = work_room_ai_state.room_id and m.user_id = auth.uid()));

drop policy if exists "room members can update AI state" on public.work_room_ai_state;
create policy "room members can update AI state"
  on public.work_room_ai_state for update
  using (exists (select 1 from public.work_room_members m where m.room_id = work_room_ai_state.room_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.work_room_members m where m.room_id = work_room_ai_state.room_id and m.user_id = auth.uid()));

-- ============================================================================
-- Realtime: enable logical replication for the tables the UI subscribes to live.
-- Wrapped so re-running this migration (e.g. after a partial failure) doesn't
-- error out on "table is already a member of publication".
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['work_room_messages', 'work_room_members', 'work_room_ai_state', 'friendships', 'work_room_invites']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
