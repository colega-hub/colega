import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listAdminUsers } from "@/lib/admin/users";
import { Link } from "@/i18n/navigation";
import { AdminPageHeader, AdminSection, PlanPill } from "@/components/admin/primitives";

export const metadata = { title: "Support / Demo — Colega Admin" };

/**
 * Section 8/9's "support/demo" capability, deliberately implemented as entitlement grants
 * rather than any form of login-as-user / impersonation (explicitly excluded — "Do NOT
 * build 'login as user' or impersonation in this phase"). Find the account, open its detail
 * page, grant temporary access from there.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const { rows } = q?.trim() ? await listAdminUsers(supabase, { search: q }) : { rows: [] };

  return (
    <div className="max-w-2xl">
      <AdminPageHeader
        title="Support / Demo"
        description="Find a user to give temporary Pro/Team access for a demo or support case — never their password, never a login-as-user session."
      />

      <AdminSection title="Find a user">
        <form method="get" className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name, username, or email…"
              className="h-10 w-full rounded-xl border border-border bg-white/[0.03] pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <button type="submit" className="h-10 shrink-0 rounded-xl border border-border-strong px-4 text-sm font-medium text-foreground hover:bg-white/[0.06]">
            Search
          </button>
        </form>

        {q && (
          <div className="mt-4 flex flex-col gap-2">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-dim">No matches.</p>
            ) : (
              rows.map((u) => (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-2.5 text-sm hover:bg-white/[0.04]"
                >
                  <div>
                    <span className="font-medium text-foreground">{u.display_name || u.username || u.email}</span>
                    <span className="ml-2 text-xs text-muted-dim">{u.email}</span>
                  </div>
                  <PlanPill plan={u.plan} />
                </Link>
              ))
            )}
          </div>
        )}
      </AdminSection>

      <p className="mt-4 text-xs text-muted-dim">
        Opening a user takes you to their detail page, which has a &quot;Grant temporary
        access&quot; panel (1/3/7/14/30 days or custom, Pro or Team). Every grant is audit-logged
        and clearly distinguished from a real paid subscription — see Subscriptions.
      </p>
    </div>
  );
}
