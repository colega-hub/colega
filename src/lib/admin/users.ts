import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminAuthUserRow,
  AdminUserListResult,
  AdminUserRow,
  EntitlementGrantRow,
  OrganizationMemberRow,
  OrganizationRow,
  PlanKey,
} from "./types";

const PAGE_SIZE = 25;

/**
 * Wraps admin_list_users() (supabase/migrations/0020_admin_users.sql) — server-side search and
 * pagination via one RPC call, never a client-side filter over the full user table (see AGENTS
 * step 17/18). Returns an empty result (never an error the UI has to special-case) if the RPC
 * itself fails, e.g. because the migration hasn't been applied yet — see
 * src/app/[locale]/admin/system/page.tsx for the health check that explains this to the owner
 * instead.
 */
export async function listAdminUsers(
  supabase: SupabaseClient,
  { search, page = 0 }: { search?: string; page?: number }
): Promise<AdminUserListResult> {
  const { data, error } = await supabase.rpc("admin_list_users", {
    search: search?.trim() || null,
    page_size: PAGE_SIZE,
    page_offset: page * PAGE_SIZE,
  });

  if (error || !data) {
    if (error) console.error("[admin] admin_list_users failed", error.message);
    return { rows: [], totalCount: 0 };
  }

  const rows = data as (AdminUserRow & { total_count: number })[];
  return {
    rows: rows.map((row): AdminUserRow => {
      const { id, email, created_at, last_sign_in_at, email_confirmed_at, banned_until, username, display_name, plan } = row;
      return { id, email, created_at, last_sign_in_at, email_confirmed_at, banned_until, username, display_name, plan };
    }),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

export const ADMIN_USERS_PAGE_SIZE = PAGE_SIZE;

export type AdminUserDetail = {
  authUser: AdminAuthUserRow | null;
  profile: { username: string | null; display_name: string | null } | null;
  subscription: { plan: PlanKey; status: string; current_period_end: string | null } | null;
  grants: EntitlementGrantRow[];
  organizations: Array<{ org: OrganizationRow; membership: OrganizationMemberRow }>;
};

/**
 * Everything the user-detail page (src/app/[locale]/admin/users/[id]/page.tsx) needs, in
 * parallel. Each piece degrades independently (a failed/empty query never breaks the others) —
 * the page renders whatever came back and shows "not available" for the rest.
 */
export async function getAdminUserDetail(
  supabase: SupabaseClient,
  targetId: string
): Promise<AdminUserDetail> {
  const [authUserResult, profileResult, subscriptionResult, grantsResult, membershipResult] = await Promise.all([
    supabase.rpc("admin_get_auth_user", { target_id: targetId }).maybeSingle(),
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", targetId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", targetId)
      .maybeSingle(),
    supabase
      .from("admin_entitlement_grants")
      .select("*")
      .eq("user_id", targetId)
      .order("granted_at", { ascending: false })
      .returns<EntitlementGrantRow[]>(),
    supabase
      .from("organization_members")
      .select("org_id, user_id, role, joined_at, job_title, organizations(id, name, owner_id, created_at, archived_at, logo_url)")
      .eq("user_id", targetId),
  ]);

  const organizations = (membershipResult.data ?? [])
    .map((row) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      if (!org) return null;
      const membership: OrganizationMemberRow = {
        org_id: row.org_id,
        user_id: row.user_id,
        role: row.role,
        joined_at: row.joined_at,
        job_title: row.job_title,
      };
      return { org: org as OrganizationRow, membership };
    })
    .filter((v): v is { org: OrganizationRow; membership: OrganizationMemberRow } => v !== null);

  return {
    authUser: (authUserResult.data as AdminAuthUserRow | null) ?? null,
    profile: profileResult.data ?? null,
    subscription: (subscriptionResult.data as
      | { plan: PlanKey; status: string; current_period_end: string | null }
      | null) ?? null,
    grants: grantsResult.data ?? [],
    organizations,
  };
}
