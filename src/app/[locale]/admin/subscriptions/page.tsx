import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AdminPageHeader, EmptyState, Pill, formatDateTime } from "@/components/admin/primitives";

export const metadata = { title: "Subscriptions — Colega Admin" };

type SubRow = {
  user_id: string;
  plan: "free" | "pro" | "teams";
  status: string;
  current_period_end: string | null;
};

type GrantRow = {
  id: string;
  user_id: string;
  plan: "pro" | "teams";
  expires_at: string;
  revoked_at: string | null;
};

const FILTERS = ["all", "free", "pro", "teams", "trialing", "admin_granted", "expired"] as const;
type Filter = (typeof FILTERS)[number];

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter: Filter = FILTERS.includes(filterParam as Filter) ? (filterParam as Filter) : "all";

  const supabase = await createClient();
  const [{ data: subs }, { data: grants }, { data: profiles }] = await Promise.all([
    supabase.from("subscriptions").select("user_id, plan, status, current_period_end").returns<SubRow[]>(),
    supabase
      .from("admin_entitlement_grants")
      .select("id, user_id, plan, expires_at, revoked_at")
      .returns<GrantRow[]>(),
    supabase.from("profiles").select("id, username, display_name"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const activeGrantByUser = new Map<string, GrantRow>();
  for (const g of grants ?? []) {
    if (!g.revoked_at && new Date(g.expires_at) > new Date()) {
      const existing = activeGrantByUser.get(g.user_id);
      if (!existing || new Date(g.expires_at) > new Date(existing.expires_at)) {
        activeGrantByUser.set(g.user_id, g);
      }
    }
  }

  const rows = (subs ?? []).map((s) => {
    const grant = activeGrantByUser.get(s.user_id);
    return {
      userId: s.user_id,
      profile: profileById.get(s.user_id),
      plan: s.plan,
      status: s.status,
      periodEnd: s.current_period_end,
      adminGranted: !!grant,
      grantExpires: grant?.expires_at ?? null,
    };
  });

  const now = new Date();
  const filtered = rows.filter((r) => {
    switch (filter) {
      case "free":
        return r.plan === "free" && !r.adminGranted;
      case "pro":
        return r.plan === "pro";
      case "teams":
        return r.plan === "teams";
      case "trialing":
        return r.status === "trialing";
      case "admin_granted":
        return r.adminGranted;
      case "expired":
        return r.periodEnd ? new Date(r.periodEnd) < now : false;
      default:
        return true;
    }
  });

  return (
    <div>
      <AdminPageHeader
        title="Subscriptions"
        description="Real entitlement data from subscriptions + admin_entitlement_grants. No Starter/Enterprise rows exist yet — see note below."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={{ pathname: "/admin/subscriptions", query: { filter: f } }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "border-accent/40 bg-accent/10 text-accent-strong"
                : "border-border-strong text-muted hover:text-foreground"
            }`}
          >
            {f.replace("_", " ")}
          </Link>
        ))}
      </div>

      <p className="mb-4 rounded-xl border border-border-strong bg-white/[0.02] px-4 py-3 text-xs text-muted-dim">
        The marketing site&apos;s pricing page also lists &quot;Starter&quot; and
        &quot;Enterprise&quot; — the backend entitlement model
        (colega/supabase/migrations/0014_entitlements.sql) only implements{" "}
        <code>free / pro / teams</code>. That gap is real, not a bug here: Starter/Enterprise
        aren&apos;t backed by any database state to show.
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No matching subscriptions" />
      ) : (
        <div className="card-surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-dim">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Period end</th>
                <th className="px-5 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.userId} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/users/${r.userId}`} className="font-medium text-foreground hover:text-accent-strong">
                      {r.profile?.display_name || r.profile?.username || r.userId}
                    </Link>
                  </td>
                  <td className="px-5 py-3 capitalize text-foreground">{r.plan}</td>
                  <td className="px-5 py-3 text-muted-dim">{r.status}</td>
                  <td className="px-5 py-3 text-muted-dim">{formatDateTime(r.periodEnd)}</td>
                  <td className="px-5 py-3">
                    {r.adminGranted ? (
                      <Pill tone="accent">Admin granted, until {formatDateTime(r.grantExpires)}</Pill>
                    ) : (
                      <Pill tone="neutral">Subscription</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
