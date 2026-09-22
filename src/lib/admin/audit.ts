import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Writes one admin_audit_log row through the caller's own authenticated client (not the
 * service-role client — the table's RLS insert policy already requires public.is_admin() AND
 * admin_user_id = auth.uid(), see supabase/migrations/0021_admin_audit_log.sql, so a normal
 * authenticated admin session can write this itself; using service_role here would only widen
 * what needs the elevated key for no benefit).
 *
 * `metadata` must never contain passwords, tokens, secrets, or full payment card data (see
 * AGENTS step 15) — every call site in src/lib/admin/actions.ts builds this object explicitly
 * from known-safe fields, nothing is ever forwarded raw.
 */
export async function recordAdminAudit(
  supabase: SupabaseClient,
  params: {
    adminUserId: string;
    action: string;
    targetUserId?: string | null;
    targetOrgId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_user_id: params.adminUserId,
    action: params.action,
    target_user_id: params.targetUserId ?? null,
    target_org_id: params.targetOrgId ?? null,
    metadata: params.metadata ?? {},
  });

  // Never let an audit-log write failure silently swallow itself — surface it in server logs
  // so a broken audit trail is loud, not invisible. The caller decides whether the failure
  // should block the action's own success response (see actions.ts: it does, by design —
  // Section 8 requires every mutation to "record an audit log", so a mutation whose audit
  // write failed should not be reported as a clean success).
  if (error) {
    console.error("[admin audit] failed to record", params.action, error.message);
  }

  return { ok: !error, error: error?.message };
}
