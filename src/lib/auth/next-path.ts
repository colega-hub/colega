/**
 * Post-login return path (e.g. `/login?next=/pricing`). Open-redirect guard: only plain,
 * locale-less in-app paths are accepted — no scheme, no `//host`, no backslashes, no query.
 */
export function safeNextPath(value: unknown): string | null {
  return typeof value === "string" && /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(value) ? value : null;
}
