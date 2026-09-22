-- Colega V2 — Insight persistence (Pass 5). Run this against the same Supabase project that
-- already has 0001-0005 applied (SQL Editor -> paste -> Run). New table only — does not touch
-- any existing table, function, or policy.
--
-- Design notes (mirrors 0004_workspace_items.sql's reasoning exactly):
--   * Insights are PRIVATE PER USER — a single-table, non-recursive RLS shape
--     (`auth.uid() = user_id`, no joins), same as workspace_items, for the same reason: no
--     possibility of the recursive-policy bug fixed for Work Rooms in 0002.
--   * user_id references auth.users directly, NOT public.profiles — same rationale as
--     workspace_items: a core app feature available to every authenticated session regardless
--     of whether that account's `profiles` row exists yet.
--   * user_id is never trusted from the client: every insert's WITH CHECK requires
--     auth.uid() = user_id.
--   * Raw screenshots are NEVER stored here or anywhere — only short derived text the Observer
--     already decided was worth surfacing (title/summary/details/suggestion), matching the
--     existing workspace_items.source_context convention.
--   * memory_candidate is stored as jsonb purely for traceability/debugging of what the Observer
--     proposed for Smart Memory on this same analysis — it is NOT re-executed from here; the
--     actual Workspace write (if any) already happened via workspaceActionExecutor at the time
--     of analysis, and workspace_item_id below links to it when that happened.

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(trim(category)) between 1 and 60),
  severity text not null check (severity in ('suggestion', 'important', 'critical')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  summary text not null check (char_length(trim(summary)) between 1 and 2000),
  details text,
  suggestion text,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Real app/window context if available (e.g. "Gmail", "Visual Studio Code") — informational
  -- only, never a hard-coded rules-engine key.
  app_context text,
  -- Semantic fingerprint of the underlying issue (see ObserverController) — lets a client-side
  -- "mark helpful/not useful" carry forward to future occurrences of the same issue if desired
  -- later; not currently enforced unique, just indexed for lookup.
  fingerprint text,
  memory_candidate jsonb,
  saved_to_workspace boolean not null default false,
  workspace_item_id uuid references public.workspace_items(id) on delete set null,
  feedback text check (feedback in ('helpful', 'not_useful')),
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists insights_user_created_idx on public.insights (user_id, created_at desc);
create index if not exists insights_user_active_idx on public.insights (user_id) where dismissed_at is null;
create index if not exists insights_user_fingerprint_idx on public.insights (user_id, fingerprint);

alter table public.insights enable row level security;

drop policy if exists "users can read their own insights" on public.insights;
create policy "users can read their own insights"
  on public.insights for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert their own insights" on public.insights;
create policy "users can insert their own insights"
  on public.insights for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update their own insights" on public.insights;
create policy "users can update their own insights"
  on public.insights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own insights" on public.insights;
create policy "users can delete their own insights"
  on public.insights for delete
  using (auth.uid() = user_id);
