-- Production Backend & API Security phase — server-authoritative Free Screen Intelligence quota.
-- Run against the same project that already has 0001-0014 applied.
--
-- Mirrors electron/quotaStore.js's exact algorithm and semantics (fixed 4-hour window, 5 uses,
-- reserve-before-the-expensive-call with an explicit release() for a LOCAL failure that happened
-- before any real OpenAI work began — spec §14) but moved server-side and made genuinely atomic
-- (spec §13: "20 simultaneous requests must not bypass 5-use limit... do not implement SELECT
-- count then INSERT if race can bypass it"). electron/quotaStore.js is NOT removed — it stays as
-- the fast, local, pre-screenshot-capture UX gate (spec §13: "client quota UI may remain for UX,
-- but it cannot grant usage"); this table/RPC is the real, tamper-proof enforcement a modified
-- client cannot bypass, called from the trusted Edge Function, never from the desktop directly.
--
-- Atomicity: `select ... for update` takes a row lock for the remainder of the calling
-- transaction (one RPC call = one transaction under PostgREST) — a concurrent second call for the
-- same user blocks on that lock until the first call's UPDATE has committed, so two callers can
-- never both observe "used = 4" and both succeed. The `insert ... on conflict do nothing` handles
-- the race on a user's very first-ever call, when no row exists yet to lock.

create table if not exists public.screen_intelligence_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.screen_intelligence_quota enable row level security;

-- Desktop may read its own remaining count for UX (spec §57's "server time controls window" —
-- this is the authoritative resetAt, not the client's local mirror). No write policy for
-- authenticated/anon — only the SECURITY DEFINER functions below (and service_role) ever write.
drop policy if exists "users can read their own quota state" on public.screen_intelligence_quota;
create policy "users can read their own quota state"
  on public.screen_intelligence_quota for select
  using (auth.uid() = user_id);

drop trigger if exists screen_intelligence_quota_set_updated_at on public.screen_intelligence_quota;
create trigger screen_intelligence_quota_set_updated_at
  before update on public.screen_intelligence_quota
  for each row execute function public.set_updated_at();

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
  now_ts timestamptz := now();
  window_len interval := interval '4 hours';
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
  end if;

  if row_used >= usage_limit then
    update public.screen_intelligence_quota
    set window_start = row_window_start, used = row_used
    where user_id = auth.uid();
    return query select false, 0, row_window_start + window_len;
    return;
  end if;

  update public.screen_intelligence_quota
  set window_start = row_window_start, used = row_used + 1
  where user_id = auth.uid();

  return query select true, (usage_limit - row_used - 1), row_window_start + window_len;
end;
$$;

revoke all on function public.reserve_screen_intelligence_quota() from public;
revoke all on function public.reserve_screen_intelligence_quota() from anon;
grant execute on function public.reserve_screen_intelligence_quota() to authenticated;

-- Refunds one reservation — the SERVER-side counterpart to quotaStore.js's release(), for the
-- same narrow case (spec §14): a reservation was taken but the request turned out not to
-- correspond to a real OpenAI call (e.g. the Edge Function's own payload validation rejected the
-- request AFTER reserving but BEFORE calling OpenAI). Never called once the OpenAI request was
-- actually dispatched, win or lose. No-op for unlimited plans (nothing was ever reserved) and
-- floors at 0 (never goes negative, never grants extra usages).
create or replace function public.release_screen_intelligence_quota()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_plan text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select e.plan into effective_plan from public.get_my_entitlement() e;
  if effective_plan in ('pro', 'teams') then
    return;
  end if;

  update public.screen_intelligence_quota
  set used = greatest(0, used - 1)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.release_screen_intelligence_quota() from public;
revoke all on function public.release_screen_intelligence_quota() from anon;
grant execute on function public.release_screen_intelligence_quota() to authenticated;
