// Maps raw Supabase Auth error strings to a small set of stable error CODES — never shown to
// the user directly (see AGENTS/steps: "do not show raw Supabase errors"). The UI translates a
// code via the `auth.errors.*` message namespace, so the same mapping works in both English and
// Turkish. Deliberately narrow, same discipline as the desktop app's src/auth/authErrors.ts:
// only well-known, verified Supabase messages are mapped — anything else falls back to
// "unknown" rather than guessing at a message that might leak internal details.

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_registered"
  | "weak_password"
  | "rate_limited"
  | "network_error"
  | "same_password"
  | "unknown";

const KNOWN_ERRORS: Array<{ match: RegExp; code: AuthErrorCode }> = [
  { match: /invalid login credentials/i, code: "invalid_credentials" },
  { match: /user already registered|already been registered/i, code: "user_already_registered" },
  { match: /email not confirmed/i, code: "email_not_confirmed" },
  { match: /password should be at least|password is too short/i, code: "weak_password" },
  { match: /email rate limit exceeded|too many requests/i, code: "rate_limited" },
  { match: /failed to fetch|network ?error|load failed/i, code: "network_error" },
  { match: /should be different from the old password|same password/i, code: "same_password" },
];

export function mapAuthErrorToCode(message: string | undefined | null): AuthErrorCode {
  if (!message) return "unknown";
  const known = KNOWN_ERRORS.find((entry) => entry.match.test(message));
  return known ? known.code : "unknown";
}
