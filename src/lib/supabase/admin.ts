import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// SERVER-ONLY, service_role client. `import "server-only"` makes any accidental import from a
// Client Component a build-time error, not just a lint warning.
//
// Deliberately narrow: only used where RLS genuinely cannot express what's needed —
//   - banning/unbanning a user (supabase.auth.admin.*), which has no RLS-governed table at all
//   - forcing an organization_members insert/delete when fixing membership as platform admin,
//     bypassing that table's intentionally restrictive org-role-scoped write policies
//
// Everything else the admin panel needs (reading all users/profiles/orgs, writing
// admin_audit_log / admin_entitlement_grants) goes through the NORMAL authenticated server
// client (src/lib/supabase/server.ts) plus the additive admin-read RLS policies and
// admin-gated SECURITY DEFINER functions added in supabase/migrations/0020-0022 — see this
// session's report for why that split is intentional (minimizes what actually needs
// service_role).
//
// The key itself:
//   - is read from process.env.SUPABASE_SERVICE_ROLE_KEY — NOT NEXT_PUBLIC_*, so Next.js never
//     inlines it into any client bundle
//   - is never returned from any Server Action or Route Handler, never logged, never put in a
//     response header or HTML attribute
//   - lives only in .env.local locally / a private (non-NEXT_PUBLIC) Netlify env var in
//     production — see .env.example
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isAdminClientConfigured = Boolean(supabaseUrl && serviceRoleKey);

/**
 * Throws if called without SUPABASE_SERVICE_ROLE_KEY configured — callers should check
 * isAdminClientConfigured first where a graceful "not configured" UI state is preferable to an
 * error (e.g. src/app/[locale]/admin/system/page.tsx).
 */
export function createAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — the admin client cannot be created."
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // This client never represents a browser session — it must never try to persist or
      // auto-refresh a session of its own.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
