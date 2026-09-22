import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth/profile";
import { logAuthError } from "@/lib/auth/errors";

/**
 * OAuth (Google) PKCE callback — the ONE place `signInWithOAuth`'s `redirectTo` ever points at
 * (see src/lib/auth/actions.ts's signInWithGoogle). Lives outside `src/app/[locale]/` on
 * purpose: it's hit directly by Supabase/Google with a plain `/auth/callback?code=...` URL that
 * has no locale segment, and `src/proxy.ts`'s matcher now excludes `/auth` so next-intl's
 * middleware never tries to rewrite it to `/en/auth/callback` (which would 404 — nothing lives
 * there).
 *
 * Uses NextResponse.redirect with THIS REQUEST's own origin (not `siteUrl`) for the final
 * redirect back into the app: whatever host Supabase/Google actually sent the browser back to
 * (colegapro.com in production, localhost in dev) is where it lands — no hardcoded domain
 * either way, and no risk of drifting from `siteUrl` if that ever gets out of sync with the
 * real production domain.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error") || searchParams.get("error_description");
  const rawNext = searchParams.get("next") ?? "/en/account";

  // Open-redirect guard: `next` only ever comes from a URL WE built (see signInWithGoogle), but
  // treat it as untrusted anyway — it round-trips through Google and the browser's address bar
  // in between. Only a same-origin, single-leading-slash path is ever honored.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/en/account";
  // The locale this request started from, recovered from `next` (e.g. "/tr/account" -> "tr"),
  // for locale-preserving error redirects below.
  const locale = next.split("/")[1] || "en";

  if (oauthError) {
    logAuthError("oauthCallback", new Error(oauthError));
    return NextResponse.redirect(`${origin}/${locale}/login?oauth_error=1`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Same lazy profile bootstrap every other sign-in path uses (see ensureProfile's doc
      // comment) — a first-time Google sign-in gets a `profiles` row exactly like a first-time
      // password sign-in does, no separate Google-only identity system. displayNameHint is
      // omitted deliberately: Google-provided accounts already have user_metadata.full_name
      // populated by Supabase from the Google profile, which ensureProfile already reads.
      await ensureProfile(supabase, data.user);
      return NextResponse.redirect(`${origin}${next}`);
    }

    logAuthError("oauthCallback", error ?? new Error("exchangeCodeForSession returned no user"));
  } else {
    logAuthError("oauthCallback", new Error("callback hit with no code and no error param"));
  }

  return NextResponse.redirect(`${origin}/${locale}/login?oauth_error=1`);
}
