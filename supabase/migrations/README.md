# colega-web migrations

These target the **same Supabase project** the desktop app (`C:\Users\Arda\colega\supabase\migrations`)
already uses — not a separate database. **Status: `0001`-`0031` are applied to that project**
(verified via `supabase migration list` — local and remote both show `0031` as current).

`0001`–`0019` are **verbatim, byte-identical copies** of the desktop repo's own migrations of
the same name (verified with `diff` at copy time) — added here purely so the Supabase CLI, run
from this repo, can reconcile local vs. remote migration history without a `migration repair`
(which would rewrite that history's bookkeeping — avoided deliberately). `db push` recognized
their version numbers as already present in the remote `schema_migrations` table and skipped
re-applying them; they exist only so `0020`-`0023` could be pushed normally. Desktop's copies
remain the source of truth for `0001`-`0019` — nothing here should ever be edited independently
of them.

`0020`–`0023` are website-owned (the admin panel):

1. `0020_admin_users.sql` — `admin_users` table, `is_admin()` (no-arg, caller-only — an earlier
   draft took an arbitrary uuid parameter and let any authenticated user probe other accounts'
   admin status; fixed before this was ever applied), admin-read policies on
   `profiles`/`subscriptions`/`organizations`/`organization_members`, `admin_list_users()` /
   `admin_get_auth_user()` search functions.
2. `0021_admin_audit_log.sql` — `admin_audit_log` table + policies.
3. `0022_admin_entitlement_grants.sql` — `admin_entitlement_grants` table + policies, and an
   updated `get_my_entitlement()` (same signature, additive behavior — see that file's header
   comment; this is the one change that also affects desktop, and was verified compatible with
   both `create_organization()` and the Edge Functions' `_shared/entitlement.ts` consumer).
4. `0023_admin_owner_bootstrap.sql` — grants the `ardaserdar` account (UUID confirmed live, see
   that file's header) the `owner` role. Idempotent (`ON CONFLICT ... DO UPDATE`), safe to
   re-run — running it twice never creates a duplicate row.

All are idempotent (`create table if not exists`, `create or replace function`,
`drop policy if exists` + `create policy`, `on conflict do update`) — safe to re-run.

`0024`–`0030` are desktop-owned, copied here verbatim (verified with `cmp`) for the same history-
reconciliation reason as `0001`–`0019`. Desktop remains their source of truth.

`0031_paddle_billing.sql` is website-owned (Paddle webhook): adds `subscriptions.additional_seats` /
`billing_event_at` and propagates purchased seats into `organization_seat_entitlements`. A copy
also sits in the desktop repo so the shared numbering never collides — next free number is `0032`.
