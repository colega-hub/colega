-- Colega Website Admin Panel — owner bootstrap, promoted from BOOTSTRAP_OWNER.sql.example into
-- a real, tracked, forward-only migration (rather than leaving production dependent on someone
-- remembering to run a standalone example file later). Idempotent — safe to re-run, never
-- creates a duplicate row (admin_users.user_id is the primary key; ON CONFLICT updates in
-- place rather than erroring or duplicating).
--
-- Authorization identity is the UUID alone, per this build's explicit requirement — NOT the
-- username, email, or display name, none of which appear in this file's executable statement
-- (only in the comment below, for a human to cross-check against the read-only query in that
-- same comment). Username/email/display name are mutable by the account holder at any time and
-- must never be trusted as an authorization key; auth.users.id is immutable for the life of the
-- account and is what every RLS policy and SECURITY DEFINER function in 0020-0022 actually
-- checks.
--
-- This UUID was CONFIRMED live (not guessed) by reading this exact account's own authenticated
-- session's own profiles row (self-read, RLS auth.uid() = id) on 2026-09-22 — see this
-- session's report for the full method. Re-verify yourself any time with:
--
--   select id, username, display_name from public.profiles where username = 'ardaserdar';
--
--   username:       ardaserdar
--   email:          ardaserdar12@gmail.com
--   display_name:   Arda Serdar
--   auth.users.id:  4091caf6-cd7f-4d1f-a829-c5f2e3834f5e
--   organizations:  owner of "Bema Bobinaj", "Second Test Co", "Song Go" (pre-existing desktop
--                   account — not created during any of this project's testing)

insert into public.admin_users (user_id, role, created_by)
values (
  '4091caf6-cd7f-4d1f-a829-c5f2e3834f5e',
  'owner',
  '4091caf6-cd7f-4d1f-a829-c5f2e3834f5e' -- self-attributed bootstrap grant
)
on conflict (user_id) do update set role = excluded.role;
