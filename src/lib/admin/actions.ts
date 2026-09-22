"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { requireAdminForAction } from "./guard";
import { recordAdminAudit } from "./audit";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const MAX_GRANT_DAYS = 30;

/**
 * Section 8/9: grant temporary Pro/Team access. Writes admin_entitlement_grants directly via
 * the caller's own authenticated client — RLS (supabase/migrations/0022) already requires
 * is_admin() AND granted_by = auth.uid(), so this needs no service_role. Every branch that can
 * mutate re-checks requireAdminForAction() itself (AGENTS step 19: never trust the caller came
 * through /admin).
 */
export async function grantTemporaryEntitlement(params: {
  userId: string;
  plan: "pro" | "teams";
  days: number;
  reason?: string;
}): Promise<AdminActionResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { ok: false, error: auth.reason };

  if (!params.userId) return { ok: false, error: "missing_user" };
  if (params.plan !== "pro" && params.plan !== "teams") return { ok: false, error: "invalid_plan" };
  if (!Number.isFinite(params.days) || params.days <= 0 || params.days > MAX_GRANT_DAYS) {
    return { ok: false, error: "invalid_duration" };
  }

  const expiresAt = new Date(Date.now() + params.days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("admin_entitlement_grants").insert({
    user_id: params.userId,
    plan: params.plan,
    granted_by: auth.user.id,
    expires_at: expiresAt,
    reason: params.reason?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  await recordAdminAudit(supabase, {
    adminUserId: auth.user.id,
    action: "grant_temporary_entitlement",
    targetUserId: params.userId,
    metadata: { plan: params.plan, days: params.days, expires_at: expiresAt, reason: params.reason ?? null },
  });

  revalidatePath("/[locale]/admin/users/[id]", "page");
  return { ok: true };
}

/** Section 9: revoke a still-active admin-granted entitlement early. */
export async function revokeTemporaryEntitlement(params: {
  grantId: string;
  userId: string;
}): Promise<AdminActionResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { ok: false, error: auth.reason };
  if (!params.grantId) return { ok: false, error: "missing_grant" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_entitlement_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user.id })
    .eq("id", params.grantId)
    .is("revoked_at", null);

  if (error) return { ok: false, error: error.message };

  await recordAdminAudit(supabase, {
    adminUserId: auth.user.id,
    action: "revoke_temporary_entitlement",
    targetUserId: params.userId,
    metadata: { grant_id: params.grantId },
  });

  revalidatePath("/[locale]/admin/users/[id]", "page");
  return { ok: true };
}

/**
 * Section 8: suspend/reactivate an account. Genuinely requires service_role — there is no
 * RLS-governed table for "is this account banned," it's a property of the auth.users row
 * itself, settable only via the Supabase Auth Admin API.
 */
export async function setUserSuspended(params: {
  userId: string;
  suspended: boolean;
  reason?: string;
}): Promise<AdminActionResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { ok: false, error: auth.reason };
  if (!params.userId) return { ok: false, error: "missing_user" };
  if (!isAdminClientConfigured) return { ok: false, error: "admin_client_not_configured" };

  // A confirmation dialog belongs in the UI (see SuspendUserButton) — this is the server-side
  // half of "show confirmation for destructive actions" (Section 8): the action itself still
  // requires an explicit, deliberate `suspended: true` argument, never inferred.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(params.userId, {
    // GoTrue's ban mechanism: a duration string, or "none" to lift a ban. ~99 years stands in
    // for "indefinite" since the API has no literal "forever" value.
    ban_duration: params.suspended ? "876000h" : "none",
  });

  if (error) return { ok: false, error: error.message };

  const supabase = await createClient();
  await recordAdminAudit(supabase, {
    adminUserId: auth.user.id,
    action: params.suspended ? "suspend_user" : "reactivate_user",
    targetUserId: params.userId,
    metadata: { reason: params.reason?.trim() || null },
  });

  revalidatePath("/[locale]/admin/users/[id]", "page");
  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

/**
 * Section 8: "resend verification where supported." Uses the caller's own authenticated
 * client — Supabase's resend() doesn't require elevated privilege, and will itself return an
 * error if the account is already confirmed or if email confirmation isn't enabled on this
 * project (see this session's report — it currently isn't).
 */
export async function resendVerificationEmail(params: {
  userId: string;
  email: string;
}): Promise<AdminActionResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { ok: false, error: auth.reason };
  if (!params.email) return { ok: false, error: "missing_email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: params.email });
  if (error) return { ok: false, error: error.message };

  await recordAdminAudit(supabase, {
    adminUserId: auth.user.id,
    action: "resend_verification",
    targetUserId: params.userId,
    metadata: {},
  });

  return { ok: true };
}

/**
 * Section 8: "add/remove organization membership where existing schema supports it." Desktop's
 * own organization_members write policies (colega/supabase/migrations/0007) intentionally
 * restrict inserts/deletes to that org's own admin/owner — a platform admin fixing a stuck
 * membership is exactly the case that needs to bypass that, so this genuinely uses the
 * service-role client rather than an additive RLS policy (unlike the READ policies added in
 * 0020, which are safe to leave permanently open to admins; a WRITE bypass is kept narrower,
 * server-action-only, and always audited).
 */
export async function setOrganizationMembership(params: {
  orgId: string;
  userId: string;
  action: "add" | "remove";
  role?: "owner" | "admin" | "member";
}): Promise<AdminActionResult> {
  const auth = await requireAdminForAction();
  if (!auth.ok) return { ok: false, error: auth.reason };
  if (!params.orgId || !params.userId) return { ok: false, error: "missing_target" };
  if (!isAdminClientConfigured) return { ok: false, error: "admin_client_not_configured" };

  const admin = createAdminClient();

  if (params.action === "add") {
    const role = params.role ?? "member";
    const { error } = await admin
      .from("organization_members")
      .upsert({ org_id: params.orgId, user_id: params.userId, role }, { onConflict: "org_id,user_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("org_id", params.orgId)
      .eq("user_id", params.userId);
    if (error) return { ok: false, error: error.message };
  }

  const supabase = await createClient();
  await recordAdminAudit(supabase, {
    adminUserId: auth.user.id,
    action: params.action === "add" ? "add_org_member" : "remove_org_member",
    targetUserId: params.userId,
    targetOrgId: params.orgId,
    metadata: { role: params.role ?? null },
  });

  revalidatePath("/[locale]/admin/users/[id]", "page");
  revalidatePath("/[locale]/admin/organizations/[id]", "page");
  return { ok: true };
}
