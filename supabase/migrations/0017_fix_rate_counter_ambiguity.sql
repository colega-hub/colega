-- Production Backend & API Security phase — fixes a real bug caught by live testing immediately
-- after 0016 was applied: `check_rate_counter`'s parameter was named `counter_key`, identical to
-- `rate_counters.counter_key` — Postgres correctly refused to guess which one was meant
-- ("column reference \"counter_key\" is ambiguous", 42702) on every call, meaning every rate-limit
-- check failed closed (SERVICE_TEMPORARILY_UNAVAILABLE) instead of actually rate-limiting.
--
-- Fix: rename the parameter to p_counter_key so no ambiguity is possible anywhere in the body.
-- Postgres' CREATE OR REPLACE FUNCTION does NOT allow renaming an existing parameter (confirmed
-- live: "cannot change name of input parameter", 42P13) — an explicit DROP FUNCTION first is
-- required, even though the type signature is otherwise unchanged. Callers must now pass
-- `p_counter_key` as the RPC arg name; the two Edge Functions calling this (via
-- supabase/functions/_shared/rateLimit.ts) are updated and redeployed alongside this migration.

drop function if exists public.check_rate_counter(text, integer, integer);

create function public.check_rate_counter(p_counter_key text, window_seconds integer, max_count integer)
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
  if p_counter_key is null or char_length(p_counter_key) = 0 or char_length(p_counter_key) > 64 then
    raise exception 'Invalid counter_key.' using errcode = '22023';
  end if;

  window_len := make_interval(secs => window_seconds);

  insert into public.rate_counters (user_id, counter_key, window_start, count)
  values (auth.uid(), p_counter_key, now_ts, 0)
  on conflict (user_id, counter_key) do nothing;

  select r.window_start, r.count into row_window_start, row_count
  from public.rate_counters r
  where r.user_id = auth.uid() and r.counter_key = p_counter_key
  for update;

  if now_ts - row_window_start >= window_len then
    row_window_start := now_ts;
    row_count := 0;
  end if;

  if row_count >= max_count then
    update public.rate_counters
    set window_start = row_window_start, count = row_count
    where user_id = auth.uid() and counter_key = p_counter_key;
    return query select false, 0, row_window_start + window_len;
    return;
  end if;

  update public.rate_counters
  set window_start = row_window_start, count = row_count + 1
  where user_id = auth.uid() and counter_key = p_counter_key;

  return query select true, (max_count - row_count - 1), row_window_start + window_len;
end;
$$;

revoke all on function public.check_rate_counter(text, integer, integer) from public;
revoke all on function public.check_rate_counter(text, integer, integer) from anon;
grant execute on function public.check_rate_counter(text, integer, integer) to authenticated;
