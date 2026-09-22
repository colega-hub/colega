import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AdminSection, DataRow, formatDateTime } from "@/components/admin/primitives";
import { OrgMembersList } from "@/components/admin/OrgMembers";
import type { OrganizationMemberRow, OrganizationRow } from "@/lib/admin/types";

export const metadata = { title: "Organization — Colega Admin" };

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, owner_id, created_at, archived_at, logo_url")
    .eq("id", id)
    .maybeSingle<OrganizationRow>();

  const { data: members } = await supabase
    .from("organization_members")
    .select("org_id, user_id, role, joined_at, job_title")
    .eq("org_id", id)
    .returns<OrganizationMemberRow[]>();

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, username, display_name").in("id", memberIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  if (!org) {
    return (
      <div>
        <Link href="/admin/organizations" className="mb-6 flex items-center gap-1.5 text-sm text-muted-dim hover:text-foreground">
          <ArrowLeft size={14} /> Back to organizations
        </Link>
        <p className="card-surface rounded-2xl p-6 text-sm text-muted-dim">
          Organization not found, or not visible with the current admin read policies.
        </p>
      </div>
    );
  }

  const membersForUi = (members ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: profileById.get(m.user_id)?.display_name ?? null,
    username: profileById.get(m.user_id)?.username ?? null,
    email: null as string | null,
  }));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/organizations" className="mb-6 flex items-center gap-1.5 text-sm text-muted-dim hover:text-foreground">
        <ArrowLeft size={14} /> Back to organizations
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-foreground">{org.name}</h1>

      <div className="grid gap-5">
        <AdminSection title="Details">
          <DataRow label="Organization ID" value={<code className="text-xs">{org.id}</code>} />
          <DataRow label="Owner user ID" value={<code className="text-xs">{org.owner_id}</code>} />
          <DataRow label="Created" value={formatDateTime(org.created_at)} />
          <DataRow label="Status" value={org.archived_at ? "Archived" : "Active"} />
        </AdminSection>

        <AdminSection title={`Members (${membersForUi.length})`}>
          <OrgMembersList orgId={org.id} members={membersForUi} />
        </AdminSection>

        <AdminSection title="Knowledge">
          <p className="text-sm text-muted-dim">
            Not shown here by design — this is an operational admin tool, not a content-review
            tool (Section 13/23). Verified/critical-rule counts would require a new admin-read
            policy on org_knowledge_items, deliberately not added.
          </p>
        </AdminSection>
      </div>
    </div>
  );
}
