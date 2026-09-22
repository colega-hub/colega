import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { usernameCandidates } from "./username";

/**
 * Reuses the desktop app's `profiles` table (id = auth.users.id, see
 * colega/supabase/migrations/0001_work_rooms.sql) instead of creating a second, website-only
 * identity table. The website signup form doesn't collect a username the way desktop's does,
 * so this derives one from the display name / email and retries on the table's unique
 * constraint — same self-only RLS (`auth.uid() = id`) the desktop app already relies on, no
 * schema or policy changes needed.
 *
 * Safe to call whenever a signed-in user might not have a profile row yet:
 *  - right after website signup, if email confirmation is disabled and a session exists;
 *  - lazily on first website login, covering the case where signup succeeded but confirmation
 *    was required (no session at signup time -> RLS blocked the insert then, exactly like
 *    desktop's own `profileIncomplete` case);
 *  - for an account that happens to have no profile row for any other reason.
 *
 * Never touches an existing row — desktop remains the source of truth for username/display
 * name once a profile exists.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User,
  displayNameHint?: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (existing) return { ok: true };

  const displayName =
    displayNameHint?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "Colega user";

  const base = displayName || user.email || user.id;

  for (const candidate of usernameCandidates(base)) {
    const { error } = await supabase
      .from("profiles")
      .insert({ id: user.id, username: candidate, display_name: displayName });

    if (!error) return { ok: true };
    // 23505 = unique_violation (username taken) — try the next candidate.
    if (error.code !== "23505") return { ok: false, error: error.message };
  }

  return { ok: false, error: "Could not allocate a unique username." };
}
