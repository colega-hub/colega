-- Free Hear on the existing 4-hour Free window + Company plan gate for knowledge authoring.
-- Run AFTER 0015 (server quota), 0026 (Hear), 0027 (Shared Workspace). Not yet applied anywhere.
--
-- ============================================================================
-- 1. FREE HEAR = 5 MINUTES PER EXISTING 4-HOUR FREE USAGE WINDOW
-- ============================================================================
-- Colega's authoritative Free window is 0015's screen_intelligence_quota row (one per user):
-- `window_start` + 4 hours. A window starts at the first metered Free use after the previous one
-- ended (lazy start) and, when it has ended, the next use starts a fresh one. Hear now lives in
-- that SAME row and window, so there is exactly one Free clock:
--   * limit: 300 seconds of listening per window;
--   * charged per transcribed Hear chunk by the trusted transcribe Edge Function (unchanged rule:
--     max(provider-measured audio seconds, wall-clock since the previous chunk of the same session
--     capped at 40s) — stop/pause is never charged);
--   * the window rolls over exactly like reserve_screen_intelligence_quota() already does
--     (now - window_start >= 4h => window_start := now, counters := 0), and that function now
--     also clears the Hear counters on rollover, so neither feature can carry usage across windows;
--   * Pro/Teams (the caller's PERSONAL effective plan, get_my_entitlement()) are never charged.
--     Hear is Personal-only: a company's Teams plan never makes it unlimited (company context is
--     not consulted at all here).
-- Behaviour change for Screen Intelligence: none in its counting or reset rule. The only
-- observable difference is that a Hear chunk can also be the Free use that opens a window (the
-- one shared window), as any Screen Check can.
--
-- 0026's monthly `hear_allowance` ledger is superseded: its functions are replaced below with the
-- same names; the table is left in place (unused, RLS-protected, never read) rather than dropped.

alter table public.screen_intelligence_quota
  add column if not exists hear_seconds_used numeric(10, 2) not null default 0,
  add column if not exists hear_last_session_id text,
  add column if not exists hear_last_charged_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'screen_intelligence_quota_hear_nonnegative') then
    alter table public.screen_intelligence_quota
      add constraint screen_intelligence_quota_hear_nonnegative check (hear_seconds_used >= 0);
  end if;
end;
$$;

create or replace function public.free_usage_window_length()
returns interval
language sql
immutable
as $$ select interval '4 hours' $$;

-- Identical to 0015 for Screen Intelligence; additionally clears the Hear counters on rollover.
create or replace function public.reserve_screen_intelligence_quota()
returns table (ok boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_plan text;
  row_window_start timestamptz;
  row_used integer;
  rolled boolean := false;
  now_ts timestamptz := now();
  window_len interval := public.free_usage_window_length();
  usage_limit constant integer := 5;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select e.plan into effective_plan from public.get_my_entitlement() e;
  if effective_plan in ('pro', 'teams') then
    return query select true, null::integer, null::timestamptz;
    return;
  end if;

  insert into public.screen_intelligence_quota (user_id, window_start, used)
  values (auth.uid(), now_ts, 0)
  on conflict (user_id) do nothing;

  select q.window_start, q.used into row_window_start, row_used
  from public.screen_intelligence_quota q
  where q.user_id = auth.uid()
  for update;

  if now_ts - row_window_start >= window_len then
    row_window_start := now_ts;
    row_used := 0;
    rolled := true;
  end if;

  if row_used >= usage_limit then
    update public.screen_intelligence_quota
    set window_start = row_window_start, used = row_used
    where user_id = auth.uid();
    return query select false, 0, row_window_start + window_len;
    return;
  end if;

  update public.screen_intelligence_quota
  set window_start = row_window_start,
      used = row_used + 1,
      hear_seconds_used = case when rolled then 0 else hear_seconds_used end,
      hear_last_session_id = case when rolled then null else hear_last_session_id end,
      hear_last_charged_at = case when rolled then null else hear_last_charged_at end
  where user_id = auth.uid();

  return query select true, (usage_limit - row_used - 1), row_window_start + window_len;
end;
$$;

revoke all on function public.reserve_screen_intelligence_quota() from public;
revoke all on function public.reserve_screen_intelligence_quota() from anon;
grant execute on function public.reserve_screen_intelligence_quota() to authenticated;

create or replace function public.hear_allowance_limit_seconds()
returns integer
language sql
immutable
as $$ select 300 $$;

-- New result shapes (unlimited flag + the window's reset time), so the old signatures go first.
drop function if exists public.get_hear_allowance();
drop function if exists public.charge_hear_allowance(text, numeric);

/** The CALLER's Hear allowance in the current Free window (read-only; never opens a window).
 * resets_at is null when no window is running (a fresh 5:00 is available now). */
create or replace function public.get_hear_allowance()
returns table (unlimited boolean, limit_seconds integer, used_seconds numeric, remaining_seconds numeric, window_start timestamptz, resets_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  effective_plan text;
  q public.screen_intelligence_quota;
  lim constant integer := public.hear_allowance_limit_seconds();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select e.plan into effective_plan from public.get_my_entitlement() e;
  if effective_plan in ('pro', 'teams') then
    return query select true, null::integer, null::numeric, null::numeric, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into q from public.screen_intelligence_quota where user_id = auth.uid();
  if q.user_id is null or now() - q.window_start >= public.free_usage_window_length() then
    return query select false, lim, 0::numeric, lim::numeric, null::timestamptz, null::timestamptz;
    return;
  end if;

  return query select false, lim, q.hear_seconds_used, greatest(0, lim - q.hear_seconds_used),
    q.window_start, q.window_start + public.free_usage_window_length();
end;
$$;

revoke all on function public.get_hear_allowance() from public;
revoke all on function public.get_hear_allowance() from anon;
grant execute on function public.get_hear_allowance() to authenticated;

/** Charges one transcribed Hear chunk to the CALLER's current Free window. Add-only, row-locked,
 * caller-scoped (identity from auth.uid()); a no-op for Pro/Teams. */
create or replace function public.charge_hear_allowance(p_session_id text, p_audio_seconds numeric)
returns table (unlimited boolean, used_seconds numeric, remaining_seconds numeric, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_plan text;
  q public.screen_intelligence_quota;
  now_ts timestamptz := now();
  window_len interval := public.free_usage_window_length();
  lim constant integer := public.hear_allowance_limit_seconds();
  audio numeric := least(greatest(coalesce(p_audio_seconds, 0), 0), 600);
  wall numeric := 0;
  charge numeric;
  new_used numeric;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select e.plan into effective_plan from public.get_my_entitlement() e;
  if effective_plan in ('pro', 'teams') then
    return query select true, null::numeric, null::numeric, null::timestamptz;
    return;
  end if;

  insert into public.screen_intelligence_quota (user_id, window_start, used)
  values (auth.uid(), now_ts, 0)
  on conflict (user_id) do nothing;

  select * into q from public.screen_intelligence_quota where user_id = auth.uid() for update;

  -- Same rollover rule as reserve_screen_intelligence_quota(): an ended window starts afresh.
  if now_ts - q.window_start >= window_len then
    q.window_start := now_ts;
    q.used := 0;
    q.hear_seconds_used := 0;
    q.hear_last_session_id := null;
    q.hear_last_charged_at := null;
  end if;

  if p_session_id is not null and q.hear_last_session_id = p_session_id and q.hear_last_charged_at is not null then
    wall := least(extract(epoch from (now_ts - q.hear_last_charged_at)), 40);
  end if;
  charge := greatest(audio, wall);
  new_used := q.hear_seconds_used + charge;

  update public.screen_intelligence_quota
     set window_start = q.window_start,
         used = q.used,
         hear_seconds_used = new_used,
         hear_last_session_id = left(p_session_id, 64),
         hear_last_charged_at = now_ts
   where user_id = auth.uid();

  return query select false, new_used, greatest(0, lim - new_used), q.window_start + window_len;
end;
$$;

revoke all on function public.charge_hear_allowance(text, numeric) from public;
revoke all on function public.charge_hear_allowance(text, numeric) from anon;
grant execute on function public.charge_hear_allowance(text, numeric) to authenticated;

-- ============================================================================
-- 2. COMPANY KNOWLEDGE AUTHORING REQUIRES AN ACTIVE TEAMS PLAN
-- ============================================================================
-- Deliberate, consistent with 0027: while a company's Teams plan is inactive its knowledge stays
-- exactly as it is — members still read it and Colega still uses verified knowledge/critical rules
-- as context, and admins can still review, edit, verify, demote or delete EXISTING items and
-- documents — but NEW knowledge authoring (a new item or draft, a document upload, a workflow
-- training session) needs the plan to be active. Role checks are unchanged; the plan is an extra,
-- server-side condition (company_plan_active, 0027).

drop policy if exists "admin or owner can propose knowledge as a draft" on public.org_knowledge_items;
create policy "admin or owner can propose knowledge as a draft"
  on public.org_knowledge_items for insert
  with check (
    public.is_org_admin(org_id)
    and created_by = auth.uid()
    and status = 'draft'
    and public.company_plan_active(org_id)
  );

drop policy if exists "admins can upload documents as themselves" on public.organization_documents;
create policy "admins can upload documents as themselves"
  on public.organization_documents for insert
  with check (public.is_org_admin(org_id) and uploaded_by = auth.uid() and public.company_plan_active(org_id));

drop policy if exists "admins can create training sessions as themselves" on public.workflow_training_sessions;
create policy "admins can create training sessions as themselves"
  on public.workflow_training_sessions for insert
  with check (public.is_org_admin(org_id) and created_by = auth.uid() and public.company_plan_active(org_id));

-- The document bucket's upload policy (0008), same condition. Skipped where there is no storage
-- schema (the local test database).
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "org admins can upload their org''s documents" on storage.objects';
    execute $p$
      create policy "org admins can upload their org's documents"
        on storage.objects for insert
        with check (
          bucket_id = 'organization-documents'
          and public.is_org_admin(((storage.foldername(name))[1])::uuid)
          and public.company_plan_active(((storage.foldername(name))[1])::uuid)
        )
    $p$;
  end if;
end;
$$;
