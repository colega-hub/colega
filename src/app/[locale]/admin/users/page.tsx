import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listAdminUsers, ADMIN_USERS_PAGE_SIZE } from "@/lib/admin/users";
import { Link } from "@/i18n/navigation";
import {
  AdminPageHeader,
  EmptyState,
  PlanPill,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/admin/primitives";

export const metadata = { title: "Users — Colega Admin" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);

  const supabase = await createClient();
  const { rows, totalCount } = await listAdminUsers(supabase, { search: q, page });

  const from = totalCount === 0 ? 0 : page * ADMIN_USERS_PAGE_SIZE + 1;
  const to = Math.min(totalCount, (page + 1) * ADMIN_USERS_PAGE_SIZE);
  const hasNext = to < totalCount;
  const hasPrev = page > 0;
  const baseQuery = q ? { q } : {};

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description={`${totalCount.toLocaleString()} account${totalCount === 1 ? "" : "s"} total.`}
      />

      <form method="get" className="mb-6 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, username, email, or user ID…"
            className="h-10 w-full rounded-xl border border-border bg-white/[0.03] pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <button
          type="submit"
          className="h-10 shrink-0 rounded-xl border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06]"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No users found"
          body={q ? `No results for "${q}".` : "Once people sign up, they'll show up here."}
        />
      ) : (
        <div className="card-surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-dim">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Email status</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-foreground hover:text-accent-strong">
                      {u.display_name || u.username || "—"}
                    </Link>
                    <div className="text-xs text-muted-dim">{u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <PlanPill plan={u.plan} />
                  </td>
                  <td className="px-5 py-3">
                    {u.banned_until && new Date(u.banned_until) > new Date() ? (
                      <Pill tone="danger">Suspended</Pill>
                    ) : u.email_confirmed_at ? (
                      <Pill tone="success">Confirmed</Pill>
                    ) : (
                      <Pill tone="warning">Unconfirmed</Pill>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-dim">{formatDate(u.created_at)}</td>
                  <td className="px-5 py-3 text-muted-dim">{formatDateTime(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-dim">
          <span>
            {from}–{to} of {totalCount}
          </span>
          <div className="flex gap-2">
            <Link
              href={{ pathname: "/admin/users", query: { ...baseQuery, page: Math.max(0, page - 1) } }}
              aria-disabled={!hasPrev}
              className={`flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 ${hasPrev ? "text-foreground hover:bg-white/[0.06]" : "pointer-events-none opacity-40"}`}
            >
              <ChevronLeft size={14} /> Prev
            </Link>
            <Link
              href={{ pathname: "/admin/users", query: { ...baseQuery, page: page + 1 } }}
              aria-disabled={!hasNext}
              className={`flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 ${hasNext ? "text-foreground hover:bg-white/[0.06]" : "pointer-events-none opacity-40"}`}
            >
              Next <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
