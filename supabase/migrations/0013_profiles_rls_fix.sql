-- Colega Phase 5 privacy audit — fixes a confirmed cross-account personal-data leak.
-- Run this against the same Supabase project that already has 0001-0012 applied (SQL Editor ->
-- paste -> Run, or `supabase db push`). Only touches the profiles table's SELECT policy and adds
-- one new SECURITY DEFINER function — no other table/policy/function is touched.
--
-- Root cause (live-verified during the Phase 5 audit): 0001_work_rooms.sql's original
-- "profiles are readable by any signed-in user" policy (`using (auth.role() = 'authenticated')`)
-- grants full-row SELECT — every column — to any authenticated stranger, not just org-mates or
-- the row's own owner. When 0011/0012 later added onboarding_version_seen, changelog_version_seen
-- and preferred_language to this table, that broad policy was never revisited, so those three
-- account-scoped PERSONAL fields (spec Phase 5 §2 explicitly classifies "language preference" and
-- "onboarding/changelog seen state" as personal/user-scoped) became readable — and every other
-- signed-up user's row enumerable in bulk — by any signed-in stranger with zero relationship to
-- the account. Confirmed live: a freshly-signed-up test account with no organization in common
-- could `select * from profiles` and read every other account's row, including these fields.
--
-- Fix: profiles' base-table SELECT policy becomes self-only. The narrower, genuinely public
-- subset of a profile (id, username, display_name, avatar_url, status — the "@username search /
-- roster / chat sender name" identity fields 0001's own comment described, never the account
-- preference fields) is still available to any authenticated caller, but only through this new
-- get_public_profiles() SECURITY DEFINER function, which explicitly excludes preferred_language,
-- onboarding_version_seen and changelog_version_seen from its return shape. This mirrors the
-- existing pattern already used for org knowledge (get_org_ai_context) and username-based
-- invitation lookup (send_organization_invitation) — a narrow, explicit, server-defined shape
-- instead of trusting the client to only ask for "safe" columns.

drop policy if exists "profiles are readable by any signed-in user" on public.profiles;
create policy "users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create or replace function public.get_public_profiles(target_ids uuid[])
returns table(id uuid, username text, display_name text, avatar_url text, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.status
  from public.profiles p
  where p.id = any(target_ids);
$$;

revoke all on function public.get_public_profiles(uuid[]) from public;
revoke all on function public.get_public_profiles(uuid[]) from anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;
