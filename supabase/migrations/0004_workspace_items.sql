-- Colega Workspace — Notes & Tasks foundation (Phase A). Run this against the same Supabase
-- project that already has 0001-0003 applied (SQL Editor -> paste -> Run). New table only —
-- does not touch any existing table, function, or policy.
--
-- Design notes:
--   * Workspace items are PRIVATE PER USER — there is no sharing/collaboration concept here
--     (that's what Work Rooms are for). Every policy is a plain `auth.uid() = user_id` check
--     with no join to any other table, so there is no possibility of the recursive-policy bug
--     fixed in 0002 — a single-table, non-recursive policy shape by construction.
--   * user_id references auth.users directly, NOT public.profiles — Workspace (like General/
--     Design/Dev) is a core app feature available to every authenticated session regardless of
--     whether that account's `profiles` row exists yet (the historical "auth user exists, profile
--     insert failed" case must not lock someone out of their own notes/tasks).
--   * user_id is never trusted from the client: every insert's WITH CHECK requires
--     auth.uid() = user_id, so the app can only ever create rows as the signed-in user.

create table if not exists public.workspace_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('note', 'task')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  content text,
  status text not null default 'open' check (status in ('open', 'completed', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_at timestamptz,
  remind_at timestamptz,
  -- Where this item came from — never affects authorization, purely informational (shown in
  -- the UI as "Added manually" / "Added by Colega" / etc.).
  source text not null default 'manual' check (source in ('manual', 'colega', 'screen', 'conversation')),
  -- Small derived text only (e.g. "Package price shown near cursor: 25,000 TL") — NEVER a raw
  -- screenshot or any sensitive/secret value. Enforced at the application layer (the sensitive-
  -- data guard runs before any insert reaches this column); this column intentionally has no
  -- size cap here beyond what's reasonable for short derived context.
  source_context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- completed_at must be null except while status = 'completed' — the application sets/clears
  -- it alongside status, but this constraint stops a client from ever recording a stale/
  -- incorrect completion time on a row that isn't actually completed.
  constraint workspace_items_completed_at_consistency check ((status = 'completed') = (completed_at is not null))
);

create index if not exists workspace_items_user_id_idx on public.workspace_items (user_id);
create index if not exists workspace_items_user_status_idx on public.workspace_items (user_id, status);
create index if not exists workspace_items_user_type_idx on public.workspace_items (user_id, type);
create index if not exists workspace_items_user_due_idx on public.workspace_items (user_id, due_at) where due_at is not null;

drop trigger if exists workspace_items_set_updated_at on public.workspace_items;
create trigger workspace_items_set_updated_at
  before update on public.workspace_items
  for each row execute function public.set_updated_at();

alter table public.workspace_items enable row level security;

drop policy if exists "users can read their own workspace items" on public.workspace_items;
create policy "users can read their own workspace items"
  on public.workspace_items for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert their own workspace items" on public.workspace_items;
create policy "users can insert their own workspace items"
  on public.workspace_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update their own workspace items" on public.workspace_items;
create policy "users can update their own workspace items"
  on public.workspace_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own workspace items" on public.workspace_items;
create policy "users can delete their own workspace items"
  on public.workspace_items for delete
  using (auth.uid() = user_id);
