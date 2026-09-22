import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AdminPageHeader, EmptyState, formatDateTime } from "@/components/admin/primitives";
import type { AuditLogRow } from "@/lib/admin/types";

export const metadata = { title: "Audit Log — Colega Admin" };

const PAGE_SIZE = 50;

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    .returns<AuditLogRow[]>();

  const rows = data ?? [];
  const total = count ?? 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div>
      <AdminPageHeader
        title="Audit Log"
        description="Every sensitive admin mutation, immutable, newest first. Never contains passwords, tokens, or card data."
      />

      {rows.length === 0 ? (
        <EmptyState title="No admin actions recorded yet" />
      ) : (
        <div className="card-surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-dim">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Target user</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 text-muted-dim">{formatDateTime(row.created_at)}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{row.action}</td>
                  <td className="px-5 py-3">
                    {row.target_user_id ? (
                      <Link href={`/admin/users/${row.target_user_id}`} className="text-accent-strong hover:underline">
                        {row.target_user_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-xs text-muted-dim">{JSON.stringify(row.metadata)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex justify-end gap-2 text-sm">
          {page > 0 && (
            <Link href={{ pathname: "/admin/audit-log", query: { page: page - 1 } }} className="rounded-lg border border-border-strong px-3 py-1.5 text-foreground hover:bg-white/[0.06]">
              Prev
            </Link>
          )}
          {hasNext && (
            <Link href={{ pathname: "/admin/audit-log", query: { page: page + 1 } }} className="rounded-lg border border-border-strong px-3 py-1.5 text-foreground hover:bg-white/[0.06]">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
