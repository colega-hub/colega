import { isAuthRetryableFetchError } from "@supabase/supabase-js";

// Maps a raw Supabase Auth error to a small set of stable error CODES — never shown to the
// user directly (see AGENTS/steps: "do not show raw Supabase errors"). The UI translates a
// code via the `auth.errors.*` message namespace, so the same mapping works in both English
// and Turkish.
//
// 2026-09-23 production incident: every login/signup on colegapro.netlify.app returned
// {status:"error", code:"unknown"} — reproduced live with known-good credentials AND a brand
// new signup, so it wasn't a credentials/duplicate-email problem, it was something common to
// every Supabase Auth call. Root cause: when supabase-js's own `fetch()` call fails outright
// (DNS/connection/CORS/timeout — it never got an HTTP response at all), it throws an
// AuthRetryableFetchError whose message is whatever the underlying runtime's fetch
// implementation says — "fetch failed" on Node/undici (Netlify's Server Actions runtime),
// "Failed to fetch" on Chrome, "Load failed" on Safari. This file's old KNOWN_ERRORS regex
// only matched the two browser phrasings ("failed to fetch", "load failed") — tested and built
// locally, where errors are only ever seen via the browser's own fetch — and never matched
// Node/undici's "fetch failed", silently downgrading a real connectivity/config failure to the
// generic "unknown" code with no way to tell it apart from an actually-mysterious error.
//
// Fixed two ways, most-reliable first:
//   1. isAuthRetryableFetchError() — supabase-js's own official type guard for exactly this
//      "never got a response" class of error, regardless of the underlying runtime's message
//      text. This is the real fix; it can't go stale the way a message regex can.
//   2. error.code — Supabase's own stable, documented error identifier (present whenever a
///     response WAS received; see node_modules/@supabase/auth-js/.../error-codes.d.ts),
//      preferred over message-regex for every other case since it isn't sensitive to wording
//      changes across supabase-js versions.
// The message regex below is now the LAST resort, for the rare case neither of the above
// applies, and is kept intentionally narrow so an unrecognized message still falls through to
// "unknown" rather than being guessed at.

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_registered"
  | "weak_password"
  | "rate_limited"
  | "network_error"
  | "same_password"
  | "unknown";

// Supabase's stable error.code -> this app's AuthErrorCode. See the ErrorCode union in
// @supabase/auth-js for the full list this is intentionally a narrow subset of.
const CODE_MAP: Partial<Record<string, AuthErrorCode>> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_already_exists: "user_already_registered",
  email_exists: "user_already_registered",
  identity_already_exists: "user_already_registered",
  weak_password: "weak_password",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  over_sms_send_rate_limit: "rate_limited",
  same_password: "same_password",
  request_timeout: "network_error",
};

// Last-resort message matching — only reached when the error has neither a recognized .code
// nor is an AuthRetryableFetchError. Deliberately narrow: only well-known, verified Supabase
// message strings are mapped — anything else falls back to "unknown" rather than guessing.
const KNOWN_MESSAGE_PATTERNS: Array<{ match: RegExp; code: AuthErrorCode }> = [
  { match: /invalid login credentials/i, code: "invalid_credentials" },
  { match: /user already registered|already been registered/i, code: "user_already_registered" },
  { match: /email not confirmed/i, code: "email_not_confirmed" },
  { match: /password should be at least|password is too short/i, code: "weak_password" },
  { match: /email rate limit exceeded|too many requests/i, code: "rate_limited" },
  {
    // Every fetch-failure phrasing seen in practice: Chrome ("Failed to fetch"), Safari ("Load
    // failed"), Firefox ("NetworkError when attempting to fetch resource"), and Node/undici
    // ("fetch failed") — kept even though isAuthRetryableFetchError() should already catch the
    // supabase-js case, as a safety net for any other code path that surfaces a raw fetch error.
    match: /failed to fetch|network ?error|load failed|fetch failed/i,
    code: "network_error",
  },
  { match: /should be different from the old password|same password/i, code: "same_password" },
];

export function mapAuthErrorToCode(error: unknown): AuthErrorCode {
  if (!error) return "unknown";

  if (isAuthRetryableFetchError(error)) return "network_error";

  if (typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && CODE_MAP[code]) return CODE_MAP[code]!;
  }

  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  const known = KNOWN_MESSAGE_PATTERNS.find((entry) => entry.match.test(message));
  return known ? known.code : "unknown";
}

/**
 * Safe server-side diagnostic logging — reaches Netlify's function logs without ever touching
 * anything sensitive. `context` is a fixed label ("login", "signup", ...), never
 * user-controlled. Logs exactly: error name, Supabase's stable .code (if any), HTTP status (if
 * any — 0 specifically means "no response was ever received", see isAuthRetryableFetchError
 * above), and the message text itself (descriptive strings like "Invalid login credentials" or
 * "fetch failed" — never a credential value).
 *
 * NEVER logged, by construction — none of these fields exist on an AuthError to begin with:
 * password, access/refresh tokens, Authorization header, cookies, the anon or service_role key.
 * Email is deliberately NOT passed by any caller of this function either (see actions.ts).
 */
export function logAuthError(context: string, error: unknown): void {
  if (!error || typeof error !== "object") {
    console.error(`[auth:${context}] non-error thrown`, error);
    return;
  }
  const e = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  console.error(
    `[auth:${context}]`,
    JSON.stringify({
      name: typeof e.name === "string" ? e.name : undefined,
      code: typeof e.code === "string" ? e.code : undefined,
      status: typeof e.status === "number" ? e.status : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
      mappedCode: mapAuthErrorToCode(error),
    })
  );
}
