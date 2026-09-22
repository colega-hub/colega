-- Production Backend & API Security phase — generic, reusable rate-limit/abuse-ceiling counter.
-- Run against the same project that already has 0001-0015 applied.
--
-- One small primitive (spec §16/§59: "do not create unnecessary infrastructure") used for every
-- non-product-quota counter the trusted Edge Functions need: a short-window per-user rate limit
-- (stop rapid-fire spam) AND a generous daily per-user abuse ceiling (stop a Pro/Teams account's
-- "unlimited" from meaning "unbounded scripted access" — spec §15/§59), for both screen-check and
-- transcribe. `counter_key` namespaces independent counters (e.g. 'screen_check_rl_60s',
-- 'screen_check_daily', 'transcribe_rl_60s', 'transcribe_daily') under the same table/function —
-- distinct from screen_intelligence_quota (0015), which has its own dedicated reserve/release
-- pair because it has real product-visible semantics (a specific resetAt shown in the UI, a
-- refund path) that these abuse counters intentionally do not.
--
-- Same atomicity approach as 0015: `select ... for update` on the (user_id, counter_key) row
-- serializes concurrent callers for that exact key.

create table if not exists public.rate_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  counter_key text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, counter_key)
);

alter table public.rate_counters enable row level security;

-- No policy at all for authenticated/anon — this table has no legitimate desktop read/write use;
-- only the SECURITY DEFINER function below (and service_role) ever touches it.

drop trigger if exists rate_counters_set_updated_at on public.rate_counters;
create trigger rate_counters_set_updated_at
  before update on public.rate_counters
  for each row execute function public.set_updated_at();

-- Periodic cleanup is unnecessary for correctness (a stale row just resets on its next window
-- check) but keeps the table small over time — safe to call from a scheduled job later; not
-- wired to anything yet, deliberately out of scope for this phase.
create or replace function public.prune_old_rate_counters()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.rate_counters where updated_at < now() - interval '30 days';
$$;

revoke all on function public.prune_old_rate_counters() from public;
revoke all on function public.prune_old_rate_counters() from anon;
revoke all on function public.prune_old_rate_counters() from authenticated;

/**
 * Atomically checks-and-increments a fixed-window counter for the CALLING user (never a
 * client-supplied user id — auth.uid() only). Returns ok=false without incrementing once the
 * window's count already reached max_count; a fixed window (not sliding/token-bucket) is
 * intentional here — simple, auditable, and more than sufficient for an abuse ceiling rather than
 * a precision rate limiter.
 */
create or replace function public.check_rate_counter(counter_key text, window_seconds integer, max_count integer)
returns table (ok boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_window_start timestamptz;
  row_count integer;
  now_ts timestamptz := now();
  window_len interval;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if counter_key is null or char_length(counter_key) = 0 or char_length(counter_key) > 64 then
    raise exception 'Invalid counter_key.' using errcode = '22023';
  end if;

  window_len := make_interval(secs => window_seconds);

  insert into public.rate_counters (user_id, counter_key, window_start, count)
  values (auth.uid(), counter_key, now_ts, 0)
  on conflict (user_id, counter_key) do nothing;

  select r.window_start, r.count into row_window_start, row_count
  from public.rate_counters r
  where r.user_id = auth.uid() and r.counter_key = check_rate_counter.counter_key
  for update;

  if now_ts - row_window_start >= window_len then
    row_window_start := now_ts;
    row_count := 0;
  end if;

  if row_count >= max_count then
    update public.rate_counters
    set window_start = row_window_start, count = row_count
    where user_id = auth.uid() and counter_key = check_rate_counter.counter_key;
    return query select false, 0, row_window_start + window_len;
    return;
  end if;

  update public.rate_counters
  set window_start = row_window_start, count = row_count + 1
  where user_id = auth.uid() and counter_key = check_rate_counter.counter_key;

  return query select true, (max_count - row_count - 1), row_window_start + window_len;
end;
$$;

revoke all on function public.check_rate_counter(text, integer, integer) from public;
revoke all on function public.check_rate_counter(text, integer, integer) from anon;
grant execute on function public.check_rate_counter(text, integer, integer) to authenticated;
