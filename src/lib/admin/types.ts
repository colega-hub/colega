// Shared admin-domain types. Hand-written (no generated Database types exist for this project
// yet — same gap noted throughout this codebase, e.g. colega/src/supabase/types.ts).

export type AdminRole = "owner" | "admin" | "support";

export type PlanKey = "free" | "pro" | "teams";

/** One row from admin_list_users() / admin_get_auth_user() joined with profile/subscription —
 * see supabase/migrations/0020_admin_users.sql. */
export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  username: string | null;
  display_name: string | null;
  plan: PlanKey;
};

/** admin_get_auth_user() only — the auth.users-only subset, without the profile/plan join that
 * admin_list_users() adds (see getAdminUserDetail, which fetches the profile separately). */
export type AdminAuthUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};

export type AdminUserListResult = {
  rows: AdminUserRow[];
  totalCount: number;
};

export type EntitlementGrantRow = {
  id: string;
  user_id: string;
  plan: "pro" | "teams";
  granted_by: string;
  granted_at: string;
  expires_at: string;
  reason: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type OrganizationRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  archived_at: string | null;
  logo_url: string | null;
};

export type OrganizationMemberRow = {
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  job_title: string | null;
};

export type AuditLogRow = {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  target_org_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
