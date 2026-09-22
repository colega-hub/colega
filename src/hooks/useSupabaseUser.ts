"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Client-side auth state for cosmetic UI (Navbar logged-in/out state, redirecting an already
 * signed-in visitor away from /login or /signup). This is presentation logic only — it is NOT
 * the authorization boundary for protected routes. /account enforces that server-side via
 * supabase.auth.getUser() in a Server Component (see src/app/[locale]/account/page.tsx).
 *
 * Also where a Supabase recovery/confirmation link's #access_token=... hash fragment gets
 * picked up: instantiating the browser client (via createClient()) is enough — supabase-js's
 * detectSessionInUrl runs automatically and this hook's onAuthStateChange subscription then
 * reflects the newly-established session.
 */
export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    // Nothing to subscribe to — the initial `loading` state (see useState above) already
    // reflects this, no setState needed here.
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (!active) return;
      setUser(result.data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
