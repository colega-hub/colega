-- Workspace context, company-scoped entitlements, and the Free Hear allowance.
-- Run against the same Supabase project AFTER 0001-0025 (0025_organization_seats.sql is required:
-- the seat model it defines is what "a company with an active Teams entitlement" builds on — this
-- migration does not redefine or duplicate any seat logic). Additive: one new column, one new
-- table, new functions, and REPLACED policies on workspace_items that are strictly narrower than
-- before for company rows and identical to before for every existing (Personal) row.
--
-- ============================================================================
-- 1. WORKSPACE ITEMS BELONG TO A CONTEXT
-- ============================================================================
-- Until now workspace_items were owned only by user_id, so "Personal" vs "Company" was purely a
-- UI label: every note/task showed up in every context. org_id makes the context part of the
-- persisted data:
--   org_id IS NULL  -> the user's Personal workspace (every row that existed before this
--                      migration keeps NULL, i.e. stays Personal — nothing is reassigned)
--   org_id = <org>  -> that user's item inside that Company's workspace
-- Items remain owned by (and private to) the user who created them — a Company workspace is the
-- user's work *within that company*, not a shared team board (sharing would be a separate,
-- deliberate product decision). Reads/writes of a Company row additionally require CURRENT
-- membership of that company: a removed member can no longer read, change or add items there
-- (their rows are kept, not deleted, and reappear if they are re-invited). An item can never move
-- between contexts (see the trigger below), so no update can carry Company A content into Company
-- B or into Personal.

alter table public.workspace_items
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

comment on column public.workspace_items.org_id is
  'NULL = the owner''s Personal workspace; otherwise the Company workspace the item was created in. Immutable after insert.';

create index if not exists workspace_items_user_org_idx on public.workspace_items (user_id, org_id);

drop policy if exists "users can read their own workspace items" on public.workspace_items;
drop policy if exists "users can read their own workspace items in a context they can access" on public.workspace_items;
create policy "users can read their own workspace items in a context they can access"
  on public.workspace_items for select
  using (auth.uid() = user_id and (org_id is null or public.is_org_member(org_id)));

drop policy if exists "users can insert their own workspace items" on public.workspace_items;
drop policy if exists "users can insert their own workspace items in a context they can access" on public.workspace_items;
create policy "users can insert their own workspace items in a context they can access"
  on public.workspace_items for insert
  with check (auth.uid() = user_id and (org_id is null or public.is_org_member(org_id)));

drop policy if exists "users can update their own workspace items" on public.workspace_items;
drop policy if exists "users can update their own workspace items in a context they can access" on public.workspace_items;
create policy "users can update their own workspace items in a context they can access"
  on public.workspace_items for update
  using (auth.uid() = user_id and (org_id is null or public.is_org_member(org_id)))
  with check (auth.uid() = user_id and (org_id is null or public.is_org_member(org_id)));

drop policy if exists "users can delete their own workspace items" on public.workspace_items;
drop policy if exists "users can delete their own workspace items in a context they can access" on public.workspace_items;
create policy "users can delete their own workspace items in a context they can access"
  on public.workspace_items for delete
  using (auth.uid() = user_id and (org_id is null or public.is_org_member(org_id)));

create or replace function public.workspace_items_context_is_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'WORKSPACE_CONTEXT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_items_context_is_immutable on public.workspace_items;
create trigger workspace_items_context_is_immutable
  before update on public.workspace_items
  for each row execute function public.workspace_items_context_is_immutable();

-- ============================================================================
-- 2. COMPANY-SCOPED ENTITLEMENT
-- ============================================================================
-- Source of truth, unchanged: subscriptions (0014). A company "has an active Teams entitlement"
-- exactly when its OWNER's subscription resolves to an active Teams plan — the same resolution
-- get_my_entitlement() applies to the owner themself (active/trialing, not past its period end).
-- Seats (0025) keep deciding who may be a member; this only decides what members get while that
-- company is their active context.
--
-- get_context_entitlement(target_org_id):
--   NULL                          -> exactly get_my_entitlement() (Personal context)
--   a company the caller is NOT a -> NOT_AUTHORIZED (a removed member gets nothing from it —
--   current member of               the client falls back to Personal/Free, fail-closed)
--   member, company has active    -> plan 'teams', unlimited usage within that company
--   Teams                            (Pro-level company features), even if the member's own
--                                    account is Free. Company creation and Personal Rules stay
--                                    what the member's OWN plan says — those are personal
--                                    capabilities, never granted by someone else's company.
--   member, no active Teams        -> the member's own personal entitlement (nothing extra)
-- The member's personal subscription row is never modified — nobody is "converted to Pro".

create or replace function public.org_has_active_teams(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organizations o
    join public.subscriptions s on s.user_id = o.owner_id
    where o.id = target_org_id
      and o.archived_at is null
      and s.plan = 'teams'
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end >= now())
  );
$$;

revoke all on function public.org_has_active_teams(uuid) from public;
revoke all on function public.org_has_active_teams(uuid) from anon;
revoke all on function public.org_has_active_teams(uuid) from authenticated;

create or replace function public.get_context_entitlement(target_org_id uuid default null)
returns table (
  context text,
  org_id uuid,
  source text,
  plan text,
  has_unlimited_usage boolean,
  can_create_company boolean,
  can_use_personal_rules boolean,
  can_use_hear boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  personal record;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into personal from public.get_my_entitlement() limit 1;

  if target_org_id is null then
    return query select 'personal'::text, null::uuid, 'personal_subscription'::text, personal.plan,
      personal.has_unlimited_personal_usage, personal.can_create_company, personal.can_use_personal_rules, true;
    return;
  end if;

  if not public.is_org_member(target_org_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if public.org_has_active_teams(target_org_id) then
    return query select 'organization'::text, target_org_id, 'company_teams'::text, 'teams'::text,
      true, personal.can_create_company, false, false;
  else
    return query select 'organization'::text, target_org_id, 'company_without_teams'::text, personal.plan,
      personal.has_unlimited_personal_usage, personal.can_create_company, false, false;
  end if;
end;
$$;

revoke all on function public.get_context_entitlement(uuid) from public;
revoke all on function public.get_context_entitlement(uuid) from anon;
grant execute on function public.get_context_entitlement(uuid) to authenticated;

-- ============================================================================
-- 3. FREE HEAR ALLOWANCE (5 minutes of listening per calendar month, UTC)
-- SUPERSEDED by 0028: Hear now uses the existing 4-hour Free window (screen_intelligence_quota);
-- 0028 replaces get_hear_allowance()/charge_hear_allowance() and leaves this table unused.
-- ============================================================================
-- Reset policy: Free users have no billing period in this schema (subscriptions has no row for
-- them), so the allowance is per calendar month (UTC): 300 seconds, starting fresh on the 1st.
-- Pro/Teams users are never charged here (the Edge Function checks the plan first).
--
-- What is charged — decided ONLY by the trusted transcribe Edge Function, per Hear chunk it
-- actually transcribed:
--   greatest(provider-measured audio seconds of the chunk,
--            wall-clock seconds since the previous charged chunk of the SAME Hear session,
--            capped at 40s)
-- The audio part (from OpenAI's own audio-token count, ~10 tokens/second) cannot be shrunk by a
-- modified client; the wall-clock part also counts quiet stretches between chunks of a
-- continuous session, so the allowance tracks listening time rather than only speech. A gap longer
-- than 40s (a stop, or a long silence where no chunk was sent) is not charged.
--
-- Charging only ever ADDS to the CALLER's own row (identity from auth.uid(), never a parameter),
-- so the only thing a modified client could do by calling it directly is use up its own
-- allowance; there is no way to reduce usage or touch another user. The transcribe Edge Function
-- calls it with the caller's own JWT after each transcribed chunk. Stopping/restarting the app, signing out, or reinstalling changes nothing: the ledger
-- lives here, keyed by user.

create table if not exists public.hear_allowance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  period_start date not null,
  seconds_used numeric(10, 2) not null default 0 check (seconds_used >= 0),
  last_session_id text,
  last_charged_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.hear_allowance enable row level security;

drop policy if exists "users can read their own hear allowance" on public.hear_allowance;
create policy "users can read their own hear allowance"
  on public.hear_allowance for select
  using (auth.uid() = user_id);
-- Deliberately no insert/update/delete policy for authenticated/anon.

create or replace function public.hear_allowance_limit_seconds()
returns integer
language sql
immutable
as $$ select 300 $$;

/** Current Free allowance of the CALLER (read-only). */
create or replace function public.get_hear_allowance()
returns table (limit_seconds integer, used_seconds numeric, remaining_seconds numeric, period_start date, period_end date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_period date := date_trunc('month', timezone('utc', now()))::date;
  used numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select case when a.period_start = current_period then a.seconds_used else 0 end into used
  from public.hear_allowance a where a.user_id = auth.uid();
  used := coalesce(used, 0);
  return query select public.hear_allowance_limit_seconds(), used,
    greatest(0, public.hear_allowance_limit_seconds() - used),
    current_period, (current_period + interval '1 month')::date;
end;
$$;

revoke all on function public.get_hear_allowance() from public;
revoke all on function public.get_hear_allowance() from anon;
grant execute on function public.get_hear_allowance() to authenticated;

/**
 * Charges one transcribed Hear chunk to the CALLER's Free allowance and returns what's left.
 * Row-locked, so concurrent chunks of the same user can't lose updates.
 */
create or replace function public.charge_hear_allowance(p_session_id text, p_audio_seconds numeric)
returns table (used_seconds numeric, remaining_seconds numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_period date := date_trunc('month', timezone('utc', now()))::date;
  row_ public.hear_allowance;
  audio numeric := least(greatest(coalesce(p_audio_seconds, 0), 0), 600);
  wall numeric := 0;
  charge numeric;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.hear_allowance (user_id, period_start)
  values (auth.uid(), current_period)
  on conflict (user_id) do nothing;

  select * into row_ from public.hear_allowance where user_id = auth.uid() for update;

  if row_.period_start <> current_period then
    row_.period_start := current_period;
    row_.seconds_used := 0;
    row_.last_session_id := null;
    row_.last_charged_at := null;
  end if;

  if p_session_id is not null and row_.last_session_id = p_session_id and row_.last_charged_at is not null then
    wall := least(extract(epoch from (now() - row_.last_charged_at)), 40);
  end if;
  charge := greatest(audio, wall);

  update public.hear_allowance
     set period_start = row_.period_start,
         seconds_used = row_.seconds_used + charge,
         last_session_id = left(p_session_id, 64),
         last_charged_at = now(),
         updated_at = now()
   where user_id = auth.uid();

  return query select row_.seconds_used + charge, greatest(0, public.hear_allowance_limit_seconds() - (row_.seconds_used + charge));
end;
$$;

revoke all on function public.charge_hear_allowance(text, numeric) from public;
revoke all on function public.charge_hear_allowance(text, numeric) from anon;
grant execute on function public.charge_hear_allowance(text, numeric) to authenticated;
