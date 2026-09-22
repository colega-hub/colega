"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

// Module-level singleton — Supabase's own guidance for Next.js: creating more than one
// GoTrueClient per browser tab causes "Multiple GoTrueClient instances" warnings and can race
// on the same storage key. Every client component that needs auth reuses this one instance.
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Never null (backed by a harmless placeholder project when unconfigured, same pattern as the
 * desktop app's src/supabase/client.ts) so imports never throw at module load time — callers
 * that perform real auth should check `isSupabaseConfigured` first. */
export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    supabaseUrl || "https://placeholder.invalid",
    supabaseAnonKey || "placeholder-anon-key"
  );
  return browserClient;
}

export { isSupabaseConfigured };
