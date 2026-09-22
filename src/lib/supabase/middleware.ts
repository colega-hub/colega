import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Refreshes the Supabase auth session (if any) on every request and writes the renewed
 * cookies onto `response`. Called from src/proxy.ts, after next-intl's own middleware has
 * produced its response, so both concerns share one final NextResponse.
 *
 * Uses getUser() rather than getSession() — per Supabase's guidance, getSession() only reads
 * the (possibly stale/tampered) cookie, while getUser() revalidates the token against the
 * Auth server. This is the ONE place that revalidation needs to happen on every request; the
 * /account page's own server-side getUser() call is the actual authorization boundary.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse
) {
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Result intentionally unused — the call itself is what triggers the refresh and cookie
  // writes above; callers that need the user should read it again server-side (e.g. the
  // /account page), never trust proxy-level state as the authorization boundary.
  await supabase.auth.getUser();

  return response;
}
