import { createClient } from "@/lib/supabase/server";
import { listAdminUsers } from "@/lib/admin/users";
import { AdminPageHeader, NotTrackedStat, StatCard, formatDateTime, PlanPill } from "@/components/admin/primitives";
import { Link } from "@/i18n/navigation";

type OverviewStats = {
  total_users: number;
  new_users_today: number;
  new_users_this_week: number;
  free_users: number;
  pro_users: number;
  teams_users: number;
  active_temporary_grants: number;
  organizations_count: number;
};

export const metadata = { title: "Overview — Colega Admin" };

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [statsResult, recentUsers] = await Promise.all([
    supabase.rpc("admin_overview_stats").maybeSingle(),
    listAdminUsers(supabase, { page: 0 }),
  ]);

  const stats = statsResult.data as OverviewStats | null;
  const recent = recentUsers.rows.slice(0, 8);

  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description="Live counts from the same Supabase project the desktop app uses. Nothing here is estimated."
      />

      {!stats ? (
        <p className="card-surface rounded-2xl p-6 text-sm text-muted-dim">
          Stats are unavailable — this usually means{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5">admin_overview_stats()</code>{" "}
          hasn&apos;t been applied yet. See <Link href="/admin/system" className="text-accent-strong">System</Link>.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total users" value={stats.total_users} />
            <StatCard label="New today" value={stats.new_users_today} />
            <StatCard label="New this week" value={stats.new_users_this_week} />
            <StatCard label="Organizations" value={stats.organizations_count} />
            <StatCard label="Free plan" value={stats.free_users} />
            <StatCard label="Pro plan" value={stats.pro_users} />
            <StatCard label="Teams plan" value={stats.teams_users} />
            <StatCard
              label="Active temp. grants"
              value={stats.active_temporary_grants}
              hint="Admin-granted, not paid"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NotTrackedStat label="Active users (recent activity)" />
            <NotTrackedStat label="MRR" />
            <NotTrackedStat label="Total revenue" />
          </div>
          <p className="mt-3 text-xs text-muted-dim">
            Active-user and revenue metrics require instrumentation that doesn&apos;t exist yet —
            see the &quot;Data availability&quot; section of this session&apos;s report for exactly
            what each one needs (session tracking for activity, a billing integration for
            revenue).
          </p>
        </>
      )}

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-dim">
          Recent registrations
        </h2>
        <div className="card-surface overflow-hidden rounded-2xl">
          {recent.length === 0 ? (
            <p className="p-6 text-sm text-muted-dim">No users yet, or data unavailable.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {recent.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/admin/users/${u.id}`} className="font-medium text-foreground hover:text-accent-strong">
                        {u.display_name || u.username || u.email || u.id}
                      </Link>
                      <div className="text-xs text-muted-dim">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <PlanPill plan={u.plan} />
                    </td>
                    <td className="px-5 py-3 text-right text-muted-dim">{formatDateTime(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
