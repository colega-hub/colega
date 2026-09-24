-- Company Insights — fast timezone validation. Run AFTER 0029.
--
-- 0029's insights_tz() validated the viewer's timezone by scanning the pg_timezone_names view.
-- Measured on the live database: ~80-90 ms per call on a warm connection and ~560 ms on a fresh
-- one — which was nearly all of each Insights RPC's server time (the analytics themselves take a
-- few ms). This replaces the scan with an actual conversion attempt: a name Postgres can use is
-- returned unchanged, anything else (unknown, malformed, oversized, null) falls back to 'UTC',
-- exactly the contract 0029 documented. Same name and signature; nothing else changes.

create or replace function public.insights_tz(p_tz text)
returns text
language plpgsql
stable
as $$
begin
  -- Cheap shape check first (IANA-style names, 'UTC', 'Etc/GMT+3'); never pass arbitrary text on.
  if p_tz is null or char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$' then
    return 'UTC';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;
