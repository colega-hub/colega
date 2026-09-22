-- Product Experience Phase (Phase 4) — user-scoped onboarding completion (spec §20: "Not globally
-- device-scoped... onboarding_version_seen"). Run this against the same Supabase project that
-- already has 0001-0010 applied.
--
-- WHY A COLUMN ON profiles, NOT A NEW TABLE: this is exactly one integer per user, already have a
-- per-user row (profiles) with an existing owner-only UPDATE policy (0001_work_rooms.sql) and no
-- column-level restriction on it — no new RLS policy is needed at all. Spec §20 explicitly warns
-- against unnecessary schema complexity; a whole new table for a single nullable integer would be
-- exactly that.
--
-- null = never seen any onboarding version (covers both a brand-new signup and every existing
-- pre-Phase-4 account — spec §22: "if existing users need to see it once because no completion
-- state exists, that's acceptable"). A signed integer >= CURRENT_ONBOARDING_VERSION (see
-- src/core/onboarding.ts) means "already seen this version or newer" — version-aware by design,
-- so a future onboarding content update can simply bump the constant to show it again once,
-- without touching this schema.
alter table public.profiles add column if not exists onboarding_version_seen integer;

-- Same reasoning, same table, same shape — the changelog's "unseen NEW indicator" (spec §27) is
-- also just "have you seen version N yet," account-scoped the same way.
alter table public.profiles add column if not exists changelog_version_seen integer;

