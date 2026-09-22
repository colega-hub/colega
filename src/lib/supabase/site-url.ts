import "server-only";

// Base URL of this website, used only to build Supabase email redirect links (confirmation,
// password recovery — see src/lib/auth/actions.ts, the only consumer). Deliberately its own
// server-only module rather than living in env.ts: env.ts is shared with the browser client
// (src/lib/supabase/client.ts imports supabaseUrl/supabaseAnonKey from it), and this file's
// fallback below reads a non-NEXT_PUBLIC_ env var that must never be evaluated in a client
// bundle — `import "server-only"` makes that a build-time error if it ever is, rather than a
// silent `undefined`.
//
// Fallback chain (never hardcodes localhost into production — AGENTS: "Do not hardcode
// localhost into production behavior. Local development must continue working"):
//   1. NEXT_PUBLIC_SITE_URL, if explicitly set — takes precedence always, e.g. once the real
//      colegapro.com domain is live and configured as a Netlify env var.
//   2. URL — Netlify's own env var for "the main address to your site" (custom domain once
//      attached, otherwise the *.netlify.app URL), set automatically on every Netlify build
//      and available at runtime in Netlify Functions too. Covers production and branch
//      deploys correctly without any manual per-deploy configuration; a Deploy Preview's
//      reset-password link would point at the production URL rather than that preview's own
//      URL (DEPLOY_PRIME_URL) — an acceptable, documented tradeoff for a value that only
//      affects an email link's destination, not local dev or production correctness.
//   3. http://localhost:3000 — local dev only, never reached on Netlify since URL is always
//      set there.
const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const netlifyUrl = process.env.URL?.trim();

export const siteUrl = (explicit || netlifyUrl || "http://localhost:3000").replace(/\/$/, "");
