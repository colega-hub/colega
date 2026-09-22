import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Server-side Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the session via Next.js's cookies() so the session is available on the very
 * next request (no client-side round-trip needed to know if someone is signed in).
 *
 * Server Components can't set cookies (the `set` call below will throw there) — that's
 * expected and safe to ignore as long as `src/proxy.ts` is refreshing the session on every
 * request, which is what actually keeps the cookie alive.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl || "https://placeholder.invalid",
    supabaseAnonKey || "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — proxy.ts already refreshes the
            // session on every request, so this is safe to swallow.
          }
        },
      },
    }
  );
}

export { isSupabaseConfigured };
