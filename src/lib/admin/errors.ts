// Maps admin action error codes (see src/lib/admin/actions.ts's AdminActionResult) to
// human-readable text for the admin UI. English-only for now (Section 25: admin panel can be
// English-first) — same "known codes get a friendly string, anything else falls through
// unchanged" discipline as src/lib/auth/errors.ts uses for the public auth forms, so a genuinely
// unexpected Postgres error message is never hidden, only the well-understood cases are
// polished.
const KNOWN_ADMIN_ERRORS: Record<string, string> = {
  unauthenticated: "You need to be signed in to do that.",
  forbidden: "You don't have admin access.",
  missing_user: "No user was specified.",
  missing_target: "No target was specified.",
  missing_grant: "No grant was specified.",
  missing_email: "This account has no email on file.",
  invalid_plan: "Choose Pro or Teams.",
  invalid_duration: "Choose a duration between 1 and 30 days.",
  admin_client_not_configured:
    "This action needs SUPABASE_SERVICE_ROLE_KEY configured (see System → Supabase) — it isn't set yet.",
};

export function friendlyAdminError(code: string): string {
  return KNOWN_ADMIN_ERRORS[code] ?? code;
}
