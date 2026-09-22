import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/site-url";
import { AdminPageHeader, AdminSection, DataRow, Pill } from "@/components/admin/primitives";
import pkg from "../../../../../package.json";

export const metadata = { title: "System — Colega Admin" };

function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return <Pill tone={ok ? "success" : "danger"}>{label ?? (ok ? "Healthy" : "Unavailable")}</Pill>;
}

export default async function AdminSystemPage() {
  let dbReachable = false;
  let dbError: string | null = null;

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      dbReachable = !error;
      dbError = error?.message ?? null;
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Unknown error";
    }
  }

  return (
    <div className="max-w-2xl">
      <AdminPageHeader title="System" description="Operational status only — never secret values." />

      <div className="grid gap-5">
        <AdminSection title="Environment">
          <DataRow label="Mode" value={<Pill>{process.env.NODE_ENV}</Pill>} />
          <DataRow label="Next.js" value={pkg.dependencies.next} />
          <DataRow label="Site URL (effective)" value={siteUrl} />
          <p className="mt-1 text-xs text-muted-dim">
            NEXT_PUBLIC_SITE_URL if set, else Netlify&apos;s own URL env var, else localhost —
            used to build password-reset / email-confirmation redirect links.
          </p>
        </AdminSection>

        <AdminSection title="Supabase">
          <DataRow label="Public client (anon key)" value={<StatusPill ok={isSupabaseConfigured} label={isSupabaseConfigured ? "Configured" : "Not configured"} />} />
          <DataRow label="Database connectivity" value={<StatusPill ok={dbReachable} label={dbReachable ? "Healthy" : "Unavailable"} />} />
          {dbError && <p className="mt-1 text-xs text-red-400">{dbError}</p>}
          <DataRow
            label="Admin service-role client"
            value={<StatusPill ok={isAdminClientConfigured} label={isAdminClientConfigured ? "Configured" : "Not configured"} />}
          />
          {!isAdminClientConfigured && (
            <p className="mt-1 text-xs text-muted-dim">
              Set SUPABASE_SERVICE_ROLE_KEY (see .env.example) to enable suspend/reactivate and
              force organization-membership fixes.
            </p>
          )}
        </AdminSection>

        <AdminSection title="Authentication">
          <DataRow label="Email/password sign-in" value={<StatusPill ok={isSupabaseConfigured} />} />
          <DataRow
            label="Email confirmation requirement"
            value={<Pill tone="warning">Disabled (observed)</Pill>}
          />
          <p className="mt-1 text-xs text-muted-dim">
            Not introspectable via the client SDK — this reflects what was empirically observed
            during testing (a fresh signup gets a session immediately). Verify in the Supabase
            dashboard under Authentication → Providers → Email.
          </p>
          <DataRow label="Google OAuth" value={<Pill tone="neutral">Not configured</Pill>} />
          <p className="mt-1 text-xs text-muted-dim">
            No provider code exists in the desktop app either. Confirm/enable in the dashboard
            under Authentication → Providers → Google.
          </p>
        </AdminSection>

        <AdminSection title="Billing">
          <DataRow label="Payment provider" value={<Pill tone="neutral">Not connected</Pill>} />
          <p className="mt-1 text-xs text-muted-dim">
            No Stripe (or other) integration exists in this codebase yet. Plan/subscription
            state is entirely manual (subscriptions table) or admin-granted
            (admin_entitlement_grants) — see Subscriptions.
          </p>
        </AdminSection>

        <AdminSection title="Admin authorization">
          <DataRow label="admin_users / is_admin()" value={<StatusPill ok={dbReachable} label={dbReachable ? "You are viewing this page, so it's working" : "Unavailable"} />} />
        </AdminSection>
      </div>
    </div>
  );
}
