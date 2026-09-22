// Reads the public Supabase config website-wide. Both values are NEXT_PUBLIC_* — safe to ship
// to the browser (the anon/publishable key only works within Row Level Security policies, it
// never bypasses them). This is the SAME Supabase project the Colega desktop app points at
// (desktop's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — see .env.example for where to get
// these values. Never add SUPABASE_SERVICE_ROLE_KEY or any other private secret here.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once .env.local has real values — lets auth code degrade to a clear "not configured"
 * state instead of throwing at import time when env vars are missing (e.g. a fresh checkout
 * before .env.local is created). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
