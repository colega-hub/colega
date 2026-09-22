// Mirrors the `username_format` check constraint in the desktop app's
// supabase/migrations/0001_work_rooms.sql exactly (colega/src/auth/username.ts), so anything
// this file produces is guaranteed to pass the database's own constraint: profiles.username is
// `^[a-z0-9_]{3,20}$`, unique, not null.
//
// The website signup form (Name, Email, Password, Confirm password) never asks for a username
// — the desktop app does. To reuse the SAME profiles table without adding a second identity
// concept, the website derives a candidate username from the display name (falling back to the
// email local-part) and lets the caller retry with a numeric suffix on a uniqueness conflict.

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): { ok: boolean; error?: string } {
  const normalized = normalizeUsername(raw);
  if (normalized.length < 3) return { ok: false, error: "too_short" };
  if (normalized.length > 20) return { ok: false, error: "too_long" };
  if (!USERNAME_PATTERN.test(normalized)) return { ok: false, error: "invalid_format" };
  return { ok: true };
}

/** Best-effort slug from a display name or email local-part: lowercase, diacritics
 * stripped, anything outside [a-z0-9_] collapsed to "_", clamped to the DB's length rules,
 * and padded up to the 3-character minimum. Never throws — always returns something that
 * passes validateUsername(), even for empty/all-symbol input. */
export function slugifyForUsername(raw: string): string {
  const ascii = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritics (café -> cafe)

  let slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (slug.length < 3) slug = `user_${slug}`.replace(/_+/g, "_").replace(/^_+/, "");
  if (slug.length < 3) slug = "user";
  if (slug.length > 20) slug = slug.slice(0, 20).replace(/_+$/, "") || "user";

  return validateUsername(slug).ok ? slug : "user";
}

/** Deterministic, low-collision sequence of candidate usernames to try against the unique
 * constraint: the base slug, then base+2, base+3, ... base truncated as needed to stay within
 * the 20-char limit once a numeric suffix is appended. */
export function* usernameCandidates(base: string): Generator<string> {
  const slug = slugifyForUsername(base);
  yield slug;
  for (let n = 2; n <= 50; n++) {
    const suffix = String(n);
    const truncated = slug.slice(0, Math.max(3, 20 - suffix.length));
    yield `${truncated}${suffix}`;
  }
}
