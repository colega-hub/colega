import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { refreshSupabaseSession } from "./lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

// Next.js only allows one exported proxy function per file, so locale routing and the
// Supabase session refresh (needed on every request so an expiring access token gets
// renewed before it reaches a Server Component) are combined here rather than as two
// separate files.
export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  return refreshSupabaseSession(request, response);
}

export const config = {
  // "auth" excluded so next-intl never rewrites /auth/callback (the Google OAuth redirect
  // target — see src/app/auth/callback/route.ts) to a locale-prefixed /en/auth/callback, which
  // has no matching route and would 404 before the OAuth code exchange ever runs.
  matcher: ["/((?!api|trpc|_next|_vercel|auth|.*\\..*).*)"],
};
