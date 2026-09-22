import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AdminPageHeader, EmptyState, formatDate } from "@/components/admin/primitives";
import type { OrganizationRow } from "@/lib/admin/types";

export const metadata = { title: "Organizations — Colega Admin" };

export default async function AdminOrganizationsPage() {
  const supabase = await createClient();

  const [{ data: orgs }, { data: members }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, owner_id, created_at, archived_at, logo_url")
      .order("created_at", { ascending: false })
      .returns<OrganizationRow[]>(),
    supabase.from("organization_members").select("org_id"),
  ]);

  const memberCounts = new Map<string, number>();
  for (const m of members ?? []) {
    memberCounts.set(m.org_id, (memberCounts.get(m.org_id) ?? 0) + 1);
  }
  // org_knowledge_items is deliberately NOT given an admin-read RLS policy (Section 13/23:
  // operational tool, not a content-surveillance tool) — knowledge counts are shown as "—"
  // rather than queried at all.

  return (
    <div>
      <AdminPageHeader
        title="Organizations"
        description={`${(orgs ?? []).length} organization${(orgs ?? []).length === 1 ? "" : "s"}.`}
      />

      {!orgs || orgs.length === 0 ? (
        <EmptyState title="No organizations yet" body="Team organizations will show up here once created." />
      ) : (
        <div className="card-surface overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-dim">
                <th className="px-5 py-3 font-medium">Organization</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Knowledge items</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/admin/organizations/${org.id}`} className="flex items-center gap-2 font-medium text-foreground hover:text-accent-strong">
                      <Building2 size={14} className="text-muted-dim" />
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-dim">{memberCounts.get(org.id) ?? 0}</td>
                  <td className="px-5 py-3 text-muted-dim">—</td>
                  <td className="px-5 py-3 text-muted-dim">{formatDate(org.created_at)}</td>
                  <td className="px-5 py-3 text-muted-dim">{org.archived_at ? "Archived" : "Active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
