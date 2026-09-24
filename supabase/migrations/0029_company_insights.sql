-- Company Insights — operational intelligence for the organization OWNER.
-- Run AFTER 0027 (Shared Workspace) and 0028. Additive only: two new tables, new functions, two
-- indexes. No existing table, policy or function changes behaviour.
--
-- ============================================================================
-- WHAT THIS IS (AND IS NOT)
-- ============================================================================
-- "How is our company actually working inside Colega?" — NOT "what is this employee doing".
-- Every metric is an aggregate of COMPANY WORKFLOW DATA, computed server-side and returned as a
-- small JSON document; the desktop never downloads raw company records to compute analytics.
--
-- PRIVACY BOUNDARY (single definition: company_insights_work()):
--   * Only Work Items with visibility = 'company' participate — items everyone in the company can
--     already see. 'private' and 'selected' items are excluded ENTIRELY (not even as counts), and
--     Personal items (org_id is null) can never match an organization filter at all.
--   * Nothing about screens, apps, websites, keystrokes, Hear, transcripts or personal AI use is
--     read or stored. The only Colega-usage signal is a company-context Screen Check/Ask counter
--     (company_insight_events) that stores NO user id, NO content, NO screenshot — just counts —
--     and is shown only as a company total, never per person, and only when the company has at
--     least insights_min_cohort() members (so it can't single out one colleague).
--   * Being owner does not unlock anything a normal member couldn't already see in the Shared
--     Workspace; it only unlocks the aggregation.
--
-- ACCESS: can_view_company_insights(org) — THE permission hook. Today: the organization OWNER
-- (organization_members.role = 'owner'). A future `can_view_company_insights` permission changes
-- only that function. On top of it, every analytics RPC requires the company's Teams plan to be
-- active (org_has_active_teams — role, membership and Personal Pro never substitute). When the plan
-- lapses nothing is deleted; the RPCs refuse (COMPANY_PLAN_INACTIVE) and no new Colega-usage events
-- are recorded until it is reactivated.
--
-- TIME: timestamps are UTC (timestamptz). Periods are ROLLING windows of exactly 7/30/90 × 24h
-- ending now, compared with the immediately preceding window of the same length — never a partial
-- calendar period against a full one. Chart buckets use the viewer's IANA timezone (validated
-- against pg_timezone_names; anything else falls back to UTC). There is no organization timezone
-- in the schema yet. A previous-period comparison is only reported when the whole previous window
-- lies after the company's first company-visible work (work_tracking_since) — otherwise it would
-- compare against "no data" rather than "no work".

-- ============================================================================
-- 1. Meta: when event-based tracking started (for "Tracking since ..." honesty)
-- ============================================================================
create table if not exists public.company_insights_meta (
  key text primary key,
  value timestamptz not null
);
alter table public.company_insights_meta enable row level security;
revoke all on public.company_insights_meta from anon, authenticated;
insert into public.company_insights_meta (key, value) values ('screen_check_events_since', now())
on conflict (key) do nothing;

-- ============================================================================
-- 2. Company-context Colega usage events (Screen Check / Ask) — append-only, content-free
-- ============================================================================
create table if not exists public.company_insight_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('screen_check')),
  -- The screen-check Edge Function's own per-request id: a retried/duplicated record of the SAME
  -- request can never be counted twice.
  request_id text not null unique check (char_length(request_id) between 1 and 64),
  occurred_at timestamptz not null default now(),
  is_ask boolean not null default false,
  findings_count smallint not null default 0 check (findings_count between 0 and 50),
  cited_findings_count smallint not null default 0 check (cited_findings_count between 0 and 50 and cited_findings_count <= findings_count),
  temporary_rule_active boolean not null default false,
  knowledge_available boolean not null default false
);
create index if not exists company_insight_events_org_time_idx on public.company_insight_events (org_id, occurred_at desc);

alter table public.company_insight_events enable row level security;
-- No policies: nobody reads or writes rows directly. Written only by record_company_screen_check()
-- (service_role, from the screen-check Edge Function); read only through the owner RPCs below.
revoke all on public.company_insight_events from anon, authenticated;
-- Append-only even for the trusted backend (organization deletion still cascades).
revoke update, delete, truncate on public.company_insight_events from service_role;

-- Company-visible Work Item access pattern for the time-range aggregates.
create index if not exists workspace_items_org_completed_idx
  on public.workspace_items (org_id, completed_at) where org_id is not null and completed_at is not null;

-- ============================================================================
-- 3. Access
-- ============================================================================
/** THE permission hook for Company Insights. Owner only (role from organization_members). */
create or replace function public.can_view_company_insights(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.org_id
    where m.org_id = target_org_id and m.user_id = auth.uid() and m.role = 'owner' and o.archived_at is null
  )
$$;
revoke all on function public.can_view_company_insights(uuid) from public, anon;
grant execute on function public.can_view_company_insights(uuid) to authenticated;

/** Minimum company size for showing Colega-usage (Screen Check) totals. */
create or replace function public.insights_min_cohort()
returns integer
language sql
immutable
as $$ select 3 $$;

/** Raises unless the caller may use full Insights for this company right now. */
create or replace function public.company_insights_guard(target_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if target_org_id is null or not public.can_view_company_insights(target_org_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.org_has_active_teams(target_org_id) then raise exception 'COMPANY_PLAN_INACTIVE'; end if;
end;
$$;
revoke all on function public.company_insights_guard(uuid) from public, anon, authenticated;

/** What the desktop needs to decide which state to show. Reveals nothing to a non-owner. */
create or replace function public.get_company_insights_access(target_org_id uuid)
returns table (can_view boolean, plan_active boolean, member_count integer, events_tracking_since timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_view_company_insights(target_org_id) then
    return query select false, null::boolean, null::integer, null::timestamptz;
    return;
  end if;
  return query select true, public.org_has_active_teams(target_org_id),
    (select count(*)::integer from public.organization_members m where m.org_id = target_org_id),
    (select value from public.company_insights_meta where key = 'screen_check_events_since');
end;
$$;
revoke all on function public.get_company_insights_access(uuid) from public, anon;
grant execute on function public.get_company_insights_access(uuid) to authenticated;

-- ============================================================================
-- 4. The privacy boundary and shared helpers (internal only)
-- ============================================================================
/** THE analytics dataset: company-visible Work Items of one organization. Nothing else.
 * Deliberately a plain (inlinable) SQL function — no SECURITY DEFINER / SET clause, which would
 * stop the planner from inlining it into the callers' queries (every caller is an owner-guarded
 * SECURITY DEFINER RPC below; clients cannot execute it). Fully schema-qualified. */
create or replace function public.company_insights_work(target_org_id uuid)
returns table (id uuid, type text, title text, status text, creator_id uuid, assignee_id uuid, created_at timestamptz, completed_at timestamptz, due_at timestamptz, source text)
language sql
stable
as $$
  select w.id, w.type, w.title, w.status, w.user_id, w.assignee_id, w.created_at, w.completed_at, w.due_at, w.source
  from public.workspace_items w
  where w.org_id = target_org_id
    and w.org_id is not null
    and w.visibility = 'company'
$$;
revoke all on function public.company_insights_work(uuid) from public, anon, authenticated;

/** Validated rolling window. */
create or replace function public.insights_days(p_days integer)
returns integer
language plpgsql
immutable
as $$
begin
  if p_days not in (7, 30, 90) then raise exception 'INVALID_RANGE'; end if;
  return p_days;
end;
$$;

/** A valid IANA timezone name, or 'UTC'. */
create or replace function public.insights_tz(p_tz text)
returns text
language sql
stable
as $$
  select coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC')
$$;

/** When the company's workflow data begins: the later of company creation and its first
 * company-visible Work Item (null = no company work yet). */
create or replace function public.company_insights_work_since(target_org_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(o.created_at, (select min(w.created_at) from public.company_insights_work(target_org_id) w))
  from public.organizations o
  where o.id = target_org_id and exists (select 1 from public.company_insights_work(target_org_id))
$$;
revoke all on function public.company_insights_work_since(uuid) from public, anon, authenticated;

/** Period flow metrics for company-visible work in [p_start, p_end). Completable types only for
 * created/completed/timing; completion time = completed_at - created_at. */
create or replace function public.company_insights_period(target_org_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with w as (select * from public.company_insights_work(target_org_id)),
  done as (
    select extract(epoch from (completed_at - created_at)) as secs
    from w where type in ('task', 'issue', 'follow_up') and status = 'completed' and completed_at >= p_start and completed_at < p_end and completed_at >= created_at
  )
  select jsonb_build_object(
    'created', (select count(*) from w where type in ('task', 'issue', 'follow_up') and created_at >= p_start and created_at < p_end),
    'completed', (select count(*) from done),
    'issues_opened', (select count(*) from w where type = 'issue' and created_at >= p_start and created_at < p_end),
    'issues_resolved', (select count(*) from w where type = 'issue' and status = 'completed' and completed_at >= p_start and completed_at < p_end),
    'follow_ups_created', (select count(*) from w where type = 'follow_up' and created_at >= p_start and created_at < p_end),
    'follow_ups_completed', (select count(*) from w where type = 'follow_up' and status = 'completed' and completed_at >= p_start and completed_at < p_end),
    'decisions', (select count(*) from w where type = 'decision' and created_at >= p_start and created_at < p_end),
    'notes', (select count(*) from w where type = 'note' and created_at >= p_start and created_at < p_end),
    'rules_created', (select count(*) from public.org_temporary_rules r where r.org_id = target_org_id and r.created_at >= p_start and r.created_at < p_end),
    'timed_completions', (select count(*) from done),
    'median_completion_seconds', (select case when count(*) >= 3 then round(percentile_cont(0.5) within group (order by secs))::bigint end from done),
    'avg_completion_seconds', (select case when count(*) >= 3 then round(avg(secs))::bigint end from done)
  )
$$;
revoke all on function public.company_insights_period(uuid, timestamptz, timestamptz) from public, anon, authenticated;

/** Current-state snapshot (as of now). Open = status 'open' completable items; archived excluded. */
create or replace function public.company_insights_snapshot(target_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with o as (select * from public.company_insights_work(target_org_id) where type in ('task', 'issue', 'follow_up') and status = 'open')
  select jsonb_build_object(
    'open', (select count(*) from o),
    'overdue', (select count(*) from o where due_at is not null and due_at < now()),
    'unresolved_issues', (select count(*) from o where type = 'issue'),
    'pending_follow_ups', (select count(*) from o where type = 'follow_up'),
    'unassigned_open', (select count(*) from o where assignee_id is null)
  )
$$;
revoke all on function public.company_insights_snapshot(uuid) from public, anon, authenticated;

/** Compact item references for a signal ("View items"): company-visible only, bounded. */
create or replace function public.company_insights_item_refs(ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'type', w.type, 'title', w.title, 'created_at', w.created_at, 'due_at', w.due_at, 'assignee_id', w.assignee_id)
                            order by coalesce(w.due_at, w.created_at)), '[]'::jsonb)
  from public.workspace_items w
  where w.id = any(ids[1:20]) and w.visibility = 'company'
$$;
revoke all on function public.company_insights_item_refs(uuid[]) from public, anon, authenticated;

-- ============================================================================
-- 5. Deterministic signals ("Needs attention") — every one traceable to counted data
-- ============================================================================
create or replace function public.company_insights_signals(target_org_id uuid, p_start timestamptz, p_end timestamptz, p_prev_start timestamptz, p_previous_complete boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  signals jsonb := '[]'::jsonb;
  ids uuid[];
  n integer;
  baseline numeric;
  baseline_n integer;
  threshold interval;
  total_assigned integer;
  top_assignee uuid;
  top_count integer;
  cur jsonb := public.company_insights_period(target_org_id, p_start, p_end);
  prev jsonb := public.company_insights_period(target_org_id, p_prev_start, p_start);
  open_issues integer;
  r record;
begin
  -- 1. Overdue work
  select array_agg(id order by due_at), count(*) into ids, n
  from public.company_insights_work(target_org_id)
  where type in ('task', 'issue', 'follow_up') and status = 'open' and due_at is not null and due_at < now();
  if n > 0 then
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'overdue', 'severity', 'attention',
      'metric', jsonb_build_object('count', n), 'items', public.company_insights_item_refs(ids)));
  end if;

  -- 2. Work open much longer than this company normally takes (baseline: median completion time
  --    over the last 90 days, needs >= 5 completions; otherwise a fixed 7-day threshold).
  select percentile_cont(0.5) within group (order by extract(epoch from (completed_at - created_at))), count(*)
    into baseline, baseline_n
  from public.company_insights_work(target_org_id)
  where type in ('task', 'issue', 'follow_up') and status = 'completed' and completed_at >= now() - interval '90 days' and completed_at >= created_at;
  if baseline_n >= 5 then
    threshold := greatest(interval '3 days', make_interval(secs => baseline * 2));
  else
    threshold := interval '7 days';
    baseline := null;
  end if;
  select array_agg(id order by created_at), count(*) into ids, n
  from public.company_insights_work(target_org_id)
  where type in ('task', 'issue', 'follow_up') and status = 'open' and created_at < now() - threshold;
  if n > 0 then
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'long_open', 'severity', 'attention',
      'metric', jsonb_build_object('count', n, 'threshold_seconds', round(extract(epoch from threshold))::bigint,
                                   'baseline_seconds', round(baseline)::bigint, 'baseline_samples', baseline_n),
      'items', public.company_insights_item_refs(ids)));
  end if;

  -- 3. Work concentrated on one CURRENT member (>= 5 open assigned items, one person >= 40%)
  select count(*) into total_assigned
  from public.company_insights_work(target_org_id) w
  where w.type in ('task', 'issue', 'follow_up') and w.status = 'open' and w.assignee_id is not null;
  if total_assigned >= 5 then
    select w.assignee_id, count(*) into top_assignee, top_count
    from public.company_insights_work(target_org_id) w
    join public.organization_members m on m.org_id = target_org_id and m.user_id = w.assignee_id
    where w.type in ('task', 'issue', 'follow_up') and w.status = 'open'
    group by w.assignee_id order by count(*) desc, w.assignee_id limit 1;
    if top_count is not null and top_count::numeric / total_assigned >= 0.4 then
      signals := signals || jsonb_build_array(jsonb_build_object('type', 'concentration', 'severity', 'info',
        'metric', jsonb_build_object('assignee_id', top_assignee,
          'name', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = top_assignee),
          'count', top_count, 'total', total_assigned, 'share_pct', round(100.0 * top_count / total_assigned)::integer),
        'items', '[]'::jsonb));
    end if;
  end if;

  -- 4. Issues opening faster than they are resolved (period), with a real open backlog
  select count(*) into open_issues from public.company_insights_work(target_org_id) where type = 'issue' and status = 'open';
  if (cur->>'issues_opened')::int > (cur->>'issues_resolved')::int and open_issues >= 3 then
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'issues_growing', 'severity', 'attention',
      'metric', jsonb_build_object('opened', (cur->>'issues_opened')::int, 'resolved', (cur->>'issues_resolved')::int, 'open_now', open_issues),
      'items', '[]'::jsonb));
  end if;

  -- 5. Follow-ups past due
  select array_agg(id order by due_at), count(*) into ids, n
  from public.company_insights_work(target_org_id)
  where type = 'follow_up' and status = 'open' and due_at is not null and due_at < now();
  if n >= 2 then
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'follow_ups_overdue', 'severity', 'attention',
      'metric', jsonb_build_object('count', n), 'items', public.company_insights_item_refs(ids)));
  end if;

  -- 6. Backlog growing in this period
  if (cur->>'created')::int - (cur->>'completed')::int >= 5
     and ((cur->>'created')::int - (cur->>'completed')::int) >= 0.25 * (cur->>'created')::int then
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'backlog_growing', 'severity', 'attention',
      'metric', jsonb_build_object('created', (cur->>'created')::int, 'completed', (cur->>'completed')::int,
                                   'net', (cur->>'created')::int - (cur->>'completed')::int),
      'items', '[]'::jsonb));
  end if;

  -- 7. Completion time changed vs the previous equal window (both >= 5 timed completions, >= 25%)
  if p_previous_complete and (cur->>'timed_completions')::int >= 5 and (prev->>'timed_completions')::int >= 5
     and (prev->>'median_completion_seconds')::numeric > 0 then
    declare
      change numeric := ((cur->>'median_completion_seconds')::numeric - (prev->>'median_completion_seconds')::numeric)
                        / (prev->>'median_completion_seconds')::numeric;
    begin
      if abs(change) >= 0.25 then
        signals := signals || jsonb_build_array(jsonb_build_object('type', case when change > 0 then 'completion_slower' else 'completion_faster' end,
          'severity', case when change > 0 then 'attention' else 'positive' end,
          'metric', jsonb_build_object('current_seconds', (cur->>'median_completion_seconds')::bigint,
                                       'previous_seconds', (prev->>'median_completion_seconds')::bigint,
                                       'change_pct', round(100 * change)::integer),
          'items', '[]'::jsonb));
      end if;
    end;
  end if;

  -- 8. Repeated Issue titles in this period (deterministic foundation for pattern detection:
  --    identical titles after lower-casing and removing digits/punctuation; >= 3 occurrences)
  for r in
    select k, count(*) as c, array_agg(id order by created_at) as item_ids, min(title) as sample
    from (
      select id, title, created_at,
             trim(regexp_replace(regexp_replace(lower(title), '[^[:alpha:][:space:]]', ' ', 'g'), '\s+', ' ', 'g')) as k
      from public.company_insights_work(target_org_id)
      where type = 'issue' and created_at >= p_start and created_at < p_end
    ) t
    where k <> ''
    group by k having count(*) >= 3
    order by count(*) desc limit 3
  loop
    signals := signals || jsonb_build_array(jsonb_build_object('type', 'repeated_issue', 'severity', 'attention',
      'metric', jsonb_build_object('title', r.sample, 'count', r.c), 'items', public.company_insights_item_refs(r.item_ids)));
  end loop;

  return signals;
end;
$$;
revoke all on function public.company_insights_signals(uuid, timestamptz, timestamptz, timestamptz, boolean) from public, anon, authenticated;

/** Range document shared by every section. */
create or replace function public.company_insights_range(target_org_id uuid, p_days integer, p_tz text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with b as (select now() as e, now() - make_interval(days => public.insights_days(p_days)) as s,
                    now() - make_interval(days => 2 * public.insights_days(p_days)) as ps,
                    public.company_insights_work_since(target_org_id) as since)
  select jsonb_build_object('days', p_days, 'start', s, 'end', e, 'previous_start', ps, 'timezone', public.insights_tz(p_tz),
                            'work_tracking_since', since, 'previous_complete', since is not null and ps >= since)
  from b
$$;
revoke all on function public.company_insights_range(uuid, integer, text) from public, anon, authenticated;

/** Created / completed / issues / backlog per bucket (local days for 7/30, local weeks for 90).
 * Backlog at a bucket's end = non-archived completable work created before it and not completed
 * before it — computed as (created before the window + running created) - (completed before the
 * window + running completed), so each measure is ONE grouped pass, not a scan per bucket. */
create or replace function public.company_insights_series(target_org_id uuid, p_start timestamptz, p_end timestamptz, p_days integer, p_tz text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with params as (
    select public.insights_tz(p_tz) as tz,
           case when p_days = 90 then 'week' else 'day' end as unit,
           case when p_days = 90 then interval '1 week' else interval '1 day' end as step
  ),
  buckets as (
    select g as local_start,
           (g at time zone p.tz) < p_start or ((g + p.step) at time zone p.tz) > p_end as partial
    from params p, generate_series(date_trunc(p.unit, p_start at time zone p.tz), date_trunc(p.unit, p_end at time zone p.tz), p.step) g
  ),
  w as materialized (
    select w.type, w.status, w.created_at, w.completed_at
    from public.company_insights_work(target_org_id) w
    where w.type in ('task', 'issue', 'follow_up')
  ),
  created as (
    select date_trunc(p.unit, w.created_at at time zone p.tz) as k,
           count(*) as n, count(*) filter (where w.type = 'issue') as issues,
           count(*) filter (where w.status <> 'archived') as n_active
    from w, params p where w.created_at >= p_start and w.created_at < p_end group by 1
  ),
  completed as (
    select date_trunc(p.unit, w.completed_at at time zone p.tz) as k,
           count(*) as n, count(*) filter (where w.type = 'issue') as issues
    from w, params p where w.status = 'completed' and w.completed_at >= p_start and w.completed_at < p_end group by 1
  ),
  base as (
    select count(*) filter (where status <> 'archived' and created_at < p_start)
         - count(*) filter (where status = 'completed' and completed_at < p_start) as backlog
    from w
  ),
  rows_ as (
    select b.local_start, b.partial,
           coalesce(c.n, 0) as created, coalesce(d.n, 0) as completed,
           coalesce(c.issues, 0) as issues_opened, coalesce(d.issues, 0) as issues_resolved,
           (select backlog from base)
             + sum(coalesce(c.n_active, 0)) over (order by b.local_start)
             - sum(coalesce(d.n, 0)) over (order by b.local_start) as backlog_end
    from buckets b
    left join created c on c.k = b.local_start
    left join completed d on d.k = b.local_start
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(local_start, 'YYYY-MM-DD'), 'partial', partial, 'created', created, 'completed', completed,
    'issues_opened', issues_opened, 'issues_resolved', issues_resolved, 'backlog_end', backlog_end) order by local_start), '[]'::jsonb)
  from rows_
$$;
revoke all on function public.company_insights_series(uuid, timestamptz, timestamptz, integer, text) from public, anon, authenticated;

-- ============================================================================
-- 6. Owner RPCs
-- ============================================================================
create or replace function public.get_company_insights_overview(target_org_id uuid, p_days integer default 30, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rng jsonb;
begin
  perform public.company_insights_guard(target_org_id);
  rng := public.company_insights_range(target_org_id, p_days, p_tz);
  return jsonb_build_object(
    'range', rng,
    'has_data', exists (select 1 from public.company_insights_work(target_org_id)),
    'snapshot', public.company_insights_snapshot(target_org_id),
    'period', public.company_insights_period(target_org_id, (rng->>'start')::timestamptz, (rng->>'end')::timestamptz),
    'previous', public.company_insights_period(target_org_id, (rng->>'previous_start')::timestamptz, (rng->>'start')::timestamptz),
    'signals', public.company_insights_signals(target_org_id, (rng->>'start')::timestamptz, (rng->>'end')::timestamptz,
                                               (rng->>'previous_start')::timestamptz, (rng->>'previous_complete')::boolean),
    'series', public.company_insights_series(target_org_id, (rng->>'start')::timestamptz, (rng->>'end')::timestamptz, p_days, p_tz),
    'recent_decisions', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'created_at', created_at, 'creator_id', creator_id) order by created_at desc), '[]'::jsonb)
      from (select * from public.company_insights_work(target_org_id) where type = 'decision' order by created_at desc limit 5) d
    )
  );
end;
$$;
revoke all on function public.get_company_insights_overview(uuid, integer, text) from public, anon;
grant execute on function public.get_company_insights_overview(uuid, integer, text) to authenticated;

create or replace function public.get_company_insights_operations(target_org_id uuid, p_days integer default 30, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rng jsonb;
begin
  perform public.company_insights_guard(target_org_id);
  rng := public.company_insights_range(target_org_id, p_days, p_tz);
  return jsonb_build_object(
    'range', rng,
    'has_data', exists (select 1 from public.company_insights_work(target_org_id)),
    'snapshot', public.company_insights_snapshot(target_org_id),
    'period', public.company_insights_period(target_org_id, (rng->>'start')::timestamptz, (rng->>'end')::timestamptz),
    'previous', public.company_insights_period(target_org_id, (rng->>'previous_start')::timestamptz, (rng->>'start')::timestamptz),
    'series', public.company_insights_series(target_org_id, (rng->>'start')::timestamptz, (rng->>'end')::timestamptz, p_days, p_tz),
    -- Age of currently open work (from creation).
    'aging', (
      select jsonb_build_object(
        'under_1d', count(*) filter (where age < interval '1 day'),
        'd1_3', count(*) filter (where age >= interval '1 day' and age < interval '3 days'),
        'd3_7', count(*) filter (where age >= interval '3 days' and age < interval '7 days'),
        'd7_30', count(*) filter (where age >= interval '7 days' and age < interval '30 days'),
        'over_30d', count(*) filter (where age >= interval '30 days'))
      from (select now() - created_at as age from public.company_insights_work(target_org_id)
            where type in ('task', 'issue', 'follow_up') and status = 'open') a
    )
  );
end;
$$;
revoke all on function public.get_company_insights_operations(uuid, integer, text) from public, anon;
grant execute on function public.get_company_insights_operations(uuid, integer, text) to authenticated;

/** Work distribution and per-member workflow outcomes. Alphabetical — never a ranking. Work is
 * attributed to its ASSIGNEE (there is no "completed by" column; unassigned work is not
 * attributed to anyone). Assignees who are no longer members are one aggregate row. */
create or replace function public.get_company_insights_team(target_org_id uuid, p_days integer default 30, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rng jsonb;
  s timestamptz;
  e timestamptz;
  ps timestamptz;
begin
  perform public.company_insights_guard(target_org_id);
  rng := public.company_insights_range(target_org_id, p_days, p_tz);
  s := (rng->>'start')::timestamptz;
  e := (rng->>'end')::timestamptz;
  ps := (rng->>'previous_start')::timestamptz;
  return jsonb_build_object(
    'range', rng,
    'has_data', exists (select 1 from public.company_insights_work(target_org_id)),
    'snapshot', public.company_insights_snapshot(target_org_id),
    'members', (
      with w as materialized (
        select w.* from public.company_insights_work(target_org_id) w where w.type in ('task', 'issue', 'follow_up') or w.created_at >= s
      ),
      by_assignee as (
        select w.assignee_id as uid,
          count(*) filter (where w.type <> 'decision' and w.type <> 'note' and w.status = 'open') as open,
          count(*) filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'open' and w.due_at < now()) as overdue,
          count(*) filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= s and w.completed_at < e) as completed,
          count(*) filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= ps and w.completed_at < s) as completed_previous,
          count(*) filter (where w.type = 'issue' and w.status = 'completed' and w.completed_at >= s and w.completed_at < e) as issues_resolved,
          count(*) filter (where w.type = 'follow_up' and w.status = 'completed' and w.completed_at >= s and w.completed_at < e) as follow_ups_completed,
          percentile_cont(0.5) within group (order by extract(epoch from (w.completed_at - w.created_at)))
            filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= s and w.completed_at < e and w.completed_at >= w.created_at) as med,
          count(*) filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= s and w.completed_at < e and w.completed_at >= w.created_at) as med_n,
          percentile_cont(0.5) within group (order by extract(epoch from (w.completed_at - w.created_at)))
            filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= ps and w.completed_at < s and w.completed_at >= w.created_at) as med_prev,
          count(*) filter (where w.type in ('task', 'issue', 'follow_up') and w.status = 'completed' and w.completed_at >= ps and w.completed_at < s and w.completed_at >= w.created_at) as med_prev_n
        from w where w.assignee_id is not null group by w.assignee_id
      ),
      by_creator as (
        select w.creator_id as uid, count(*) as created from w where w.created_at >= s and w.created_at < e group by w.creator_id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', m.user_id, 'role', m.role, 'name', coalesce(nullif(p.display_name, ''), p.username, ''),
          'open', coalesce(a.open, 0), 'overdue', coalesce(a.overdue, 0), 'completed', coalesce(a.completed, 0),
          'completed_previous', coalesce(a.completed_previous, 0), 'issues_resolved', coalesce(a.issues_resolved, 0),
          'follow_ups_completed', coalesce(a.follow_ups_completed, 0), 'created', coalesce(c.created, 0),
          'median_completion_seconds', case when a.med_n >= 3 then round(a.med)::bigint end,
          'median_completion_seconds_previous', case when a.med_prev_n >= 3 then round(a.med_prev)::bigint end)
        order by lower(coalesce(nullif(p.display_name, ''), p.username, '')), m.user_id), '[]'::jsonb)
      from public.organization_members m
      left join public.profiles p on p.id = m.user_id
      left join by_assignee a on a.uid = m.user_id
      left join by_creator c on c.uid = m.user_id
      where m.org_id = target_org_id
    ),
    'former_members', (
      select jsonb_build_object(
        'open', count(*) filter (where w.status = 'open'),
        'completed', count(*) filter (where w.status = 'completed' and w.completed_at >= s and w.completed_at < e))
      from public.company_insights_work(target_org_id) w
      where w.assignee_id is not null and w.type in ('task', 'issue', 'follow_up')
        and not exists (select 1 from public.organization_members m where m.org_id = target_org_id and m.user_id = w.assignee_id)
    )
  );
end;
$$;
revoke all on function public.get_company_insights_team(uuid, integer, text) from public, anon;
grant execute on function public.get_company_insights_team(uuid, integer, text) to authenticated;

/** One CURRENT member's open company-visible assigned work (what the owner could already open in
 * the Shared Workspace), oldest first, bounded. */
create or replace function public.get_company_insights_member_work(target_org_id uuid, p_member uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.company_insights_guard(target_org_id);
  if not exists (select 1 from public.organization_members m where m.org_id = target_org_id and m.user_id = p_member) then
    raise exception 'NOT_A_MEMBER';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'title', title, 'created_at', created_at, 'due_at', due_at,
                                                 'overdue', due_at is not null and due_at < now()) order by created_at), '[]'::jsonb)
    from (
      select * from public.company_insights_work(target_org_id) w
      where w.assignee_id = p_member and w.type in ('task', 'issue', 'follow_up') and w.status = 'open'
      order by w.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x
  );
end;
$$;
revoke all on function public.get_company_insights_member_work(uuid, uuid, integer) from public, anon;
grant execute on function public.get_company_insights_member_work(uuid, uuid, integer) to authenticated;

/** What Colega did for this company — company totals only, never per person. */
create or replace function public.get_company_insights_impact(target_org_id uuid, p_days integer default 30, p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  rng jsonb;
  s timestamptz;
  e timestamptz;
  ps timestamptz;
  since timestamptz := (select value from public.company_insights_meta where key = 'screen_check_events_since');
  members integer := (select count(*) from public.organization_members m where m.org_id = target_org_id);
  cohort_ok boolean;
begin
  perform public.company_insights_guard(target_org_id);
  rng := public.company_insights_range(target_org_id, p_days, p_tz);
  s := (rng->>'start')::timestamptz;
  e := (rng->>'end')::timestamptz;
  ps := (rng->>'previous_start')::timestamptz;
  cohort_ok := members >= public.insights_min_cohort();
  return jsonb_build_object(
    'range', rng,
    'member_count', members,
    'min_cohort', public.insights_min_cohort(),
    'events_tracking_since', since,
    'events_previous_complete', since is not null and ps >= since,
    -- Screen Check / Ask totals: only for companies large enough not to single anyone out.
    'checks', case when cohort_ok then (
      select jsonb_build_object(
        'checks', count(*) filter (where not is_ask),
        'asks', count(*) filter (where is_ask),
        'findings', coalesce(sum(findings_count), 0),
        'cited_findings', coalesce(sum(cited_findings_count), 0),
        'with_temporary_rule', count(*) filter (where temporary_rule_active),
        'with_knowledge', count(*) filter (where knowledge_available))
      from public.company_insight_events ev where ev.org_id = target_org_id and ev.occurred_at >= s and ev.occurred_at < e) end,
    'checks_previous', case when cohort_ok then (
      select jsonb_build_object('checks', count(*) filter (where not is_ask), 'asks', count(*) filter (where is_ask),
                                'findings', coalesce(sum(findings_count), 0), 'cited_findings', coalesce(sum(cited_findings_count), 0))
      from public.company_insight_events ev where ev.org_id = target_org_id and ev.occurred_at >= ps and ev.occurred_at < s) end,
    -- Company-visible Work Items created THROUGH Colega (Ask auto-save = 'colega', a confirmed
    -- screen action = 'screen'), by type.
    'captured', (
      select jsonb_build_object(
        'task', count(*) filter (where type = 'task'), 'note', count(*) filter (where type = 'note'),
        'issue', count(*) filter (where type = 'issue'), 'decision', count(*) filter (where type = 'decision'),
        'follow_up', count(*) filter (where type = 'follow_up'), 'total', count(*))
      from public.company_insights_work(target_org_id) w
      where w.source in ('colega', 'screen') and w.created_at >= s and w.created_at < e),
    'captured_previous_total', (
      select count(*) from public.company_insights_work(target_org_id) w
      where w.source in ('colega', 'screen') and w.created_at >= ps and w.created_at < s),
    'decisions_preserved', (select count(*) from public.company_insights_work(target_org_id) w where w.type = 'decision' and w.created_at >= s and w.created_at < e),
    'rules_created', (select count(*) from public.org_temporary_rules r where r.org_id = target_org_id and r.created_at >= s and r.created_at < e)
  );
end;
$$;
revoke all on function public.get_company_insights_impact(uuid, integer, text) from public, anon;
grant execute on function public.get_company_insights_impact(uuid, integer, text) to authenticated;

-- ============================================================================
-- 7. Recording a company-context Screen Check / Ask (trusted backend only)
-- ============================================================================
/** Called by the screen-check Edge Function with the SERVICE ROLE after a successful analysis in a
 * company context. Records nothing unless the user is a CURRENT member and the company's Teams plan
 * is active. No user id, no content is stored. Idempotent per request id. Returns whether a row
 * was written. p_cited_titles are the knowledge titles the model said findings were based on:
 * only those that EXACTLY match one of this company's verified/critical-rule knowledge titles
 * (case/whitespace-insensitive) are counted — the same check the desktop applies before it shows
 * a "based on" source — and the titles themselves are never stored. */
create or replace function public.record_company_screen_check(p_user_id uuid, p_org_id uuid, p_request_id text, p_is_ask boolean, p_findings integer, p_cited_titles text[])
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f integer := least(greatest(coalesce(p_findings, 0), 0), 50);
  c integer;
begin
  if p_user_id is null or p_org_id is null or p_request_id is null or char_length(p_request_id) not between 1 and 64 then return false; end if;
  if not exists (select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = p_user_id) then return false; end if;
  if not public.org_has_active_teams(p_org_id) then return false; end if;
  select count(*) into c
  from unnest((coalesce(p_cited_titles, '{}'::text[]))[1:50]) as t(title)
  where exists (
    select 1 from public.org_knowledge_items k
    where k.org_id = p_org_id and k.status in ('verified', 'critical_rule')
      and lower(trim(k.title)) = lower(trim(t.title))
  );
  c := least(c, f);
  insert into public.company_insight_events (org_id, event_type, request_id, is_ask, findings_count, cited_findings_count, temporary_rule_active, knowledge_available)
  values (p_org_id, 'screen_check', p_request_id, coalesce(p_is_ask, false), f, c,
          exists (select 1 from public.org_temporary_rules r where r.org_id = p_org_id and r.revoked_at is null and r.starts_at <= now() and (r.expires_at is null or r.expires_at > now())),
          exists (select 1 from public.org_knowledge_items k where k.org_id = p_org_id and k.status in ('verified', 'critical_rule')))
  on conflict (request_id) do nothing;
  return found;
end;
$$;
revoke all on function public.record_company_screen_check(uuid, uuid, text, boolean, integer, text[]) from public, anon, authenticated;
grant execute on function public.record_company_screen_check(uuid, uuid, text, boolean, integer, text[]) to service_role;
