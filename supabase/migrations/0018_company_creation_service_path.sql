-- Post-backend hotfix — Bug 1 (Teams DEV simulation could not create a Company).
--
-- Root cause: create_organization() (0007/0014) is called directly via supabase.rpc() from the
-- renderer and independently re-checks get_my_entitlement() — correctly, for a REAL user. But the
-- desktop's DEV plan selector (prefs.devPlan) never reached the server at all: it only ever
-- changed local React/Electron state, so a developer simulating Teams still hit the account's
-- REAL (Free) entitlement server-side and got TEAMS_ENTITLEMENT_REQUIRED, exactly as a real Free
-- user correctly should. That's not a bug in create_organization() — it was working exactly as
-- designed. The actual gap was that DEV simulation had no path to the server at all.
--
-- Fix: create_organization_for_user() is a privileged twin of create_organization() with NO
-- entitlement check of its own and NO grant to `authenticated`/`anon` at all (see the explicit
-- revokes below — Postgres grants EXECUTE to PUBLIC by default, so the revoke-from-public is load-
-- bearing, same as every other SECURITY DEFINER function in this schema). It is reachable ONLY via
-- service_role, i.e. only from the new supabase/functions/create-company Edge Function, which
-- independently resolves entitlement itself (real, or a verified DEV-only override — see
-- supabase/functions/_shared/devOverride.ts) BEFORE ever calling this. A normal authenticated
-- client — desktop or a bare curl/PostgREST call — cannot reach this function directly, full stop.
--
-- create_organization() itself is UNCHANGED and still the only path for a real user calling the
-- RPC directly (kept for any other legitimate direct caller); this migration only adds the new
-- privileged function alongside it.

create or replace function public.create_organization_for_user(target_user_id uuid, org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trimmed_name text := trim(org_name);
  new_org public.organizations;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Unknown user.' using errcode = '22023';
  end if;
  if char_length(trimmed_name) < 1 or char_length(trimmed_name) > 80 then
    raise exception 'Organization name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  insert into public.organizations (name, owner_id)
  values (trimmed_name, target_user_id)
  returning * into new_org;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org.id, target_user_id, 'owner');

  return new_org;
end;
$$;

revoke all on function public.create_organization_for_user(uuid, text) from public;
revoke all on function public.create_organization_for_user(uuid, text) from anon;
revoke all on function public.create_organization_for_user(uuid, text) from authenticated;
-- Deliberately no grant to authenticated/anon — service_role (which bypasses function grants
-- entirely) is the only caller, i.e. only the trusted create-company Edge Function.
