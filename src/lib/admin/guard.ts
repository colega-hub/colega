import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type AdminGuardResult =
  | { status: "unauthenticated" }
  | { status: "forbidden"; user: User }
  | { status: "ok"; user: User };

/**
 * THE authorization check for the admin panel — every /admin page and every admin Server
 * Action calls this independently (never trusts a previous check, never trusts that a request
 * came from /admin: see AGENTS step 19). Resolves "admin" via the `is_admin()` RPC (see
 * supabase/migrations/0020_admin_users.sql), a SECURITY DEFINER function keyed on the caller's
 * own auth.uid() — this uses the NORMAL authenticated client, not the service-role admin
 * client, since checking "am I an admin" needs no elevated privilege.
 */
export async function checkAdmin(): Promise<AdminGuardResult> {
  if (!isSupabaseConfigured) return { status: "unauthenticated" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "unauthenticated" };

  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  // A missing function (migration not applied yet) or any other RPC error must fail CLOSED,
  // never open — an admin panel that "fails open" when misconfigured is worse than one that
  // simply isn't available yet.
  if (error || !isAdmin) return { status: "forbidden", user };

  return { status: "ok", user };
}

/**
 * Convenience wrapper for Server Actions: returns the admin user on success, or a translated
 * error-safe rejection the caller can return directly as an action result. Never throws for the
 * "not admin" case (so a direct, crafted call to the action fails the same clean way a UI-driven
 * call would) — only a genuine unexpected condition should throw.
 */
export async function requireAdminForAction(): Promise<
  { ok: true; user: User } | { ok: false; reason: "unauthenticated" | "forbidden" }
> {
  const result = await checkAdmin();
  if (result.status === "unauthenticated") return { ok: false, reason: "unauthenticated" };
  if (result.status === "forbidden") return { ok: false, reason: "forbidden" };
  return { ok: true, user: result.user };
}
