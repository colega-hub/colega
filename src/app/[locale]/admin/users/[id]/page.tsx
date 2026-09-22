import { ArrowLeft, Ban, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminUserDetail } from "@/lib/admin/users";
import { Link } from "@/i18n/navigation";
import {
  AdminSection,
  DataRow,
  Pill,
  PlanPill,
  formatDateTime,
} from "@/components/admin/primitives";
import {
  GrantEntitlementForm,
  GrantsList,
  ResendVerificationButton,
  SuspendToggleButton,
} from "@/components/admin/UserActions";

export const metadata = { title: "User — Colega Admin" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const detail = await getAdminUserDetail(supabase, id);

  const suspended = !!detail.authUser?.banned_until && new Date(detail.authUser.banned_until) > new Date();
  const name = detail.profile?.display_name || detail.profile?.username || "Unknown user";
  const plan = detail.subscription?.plan ?? "free";

  return (
    <div className="max-w-4xl">
      <Link href="/admin/users" className="mb-6 flex items-center gap-1.5 text-sm text-muted-dim hover:text-foreground">
        <ArrowLeft size={14} /> Back to users
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            {name}
            {suspended && (
              <Pill tone="danger">
                <Ban size={11} /> Suspended
              </Pill>
            )}
          </h1>
          <p className="text-sm text-muted-dim">{detail.authUser?.email}</p>
        </div>
        {detail.authUser && <SuspendToggleButton userId={id} suspended={suspended} />}
      </div>

      {!detail.authUser && (
        <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Could not load auth details for this user (admin_get_auth_user unavailable or no such
          user). The sections below show whatever other data is still available.
        </p>
      )}

      <div className="grid gap-5">
        <AdminSection title="Identity">
          <DataRow label="Name" value={detail.profile?.display_name ?? "—"} />
          <DataRow label="Username" value={detail.profile?.username ?? "—"} />
          <DataRow label="Email" value={detail.authUser?.email ?? "—"} />
          <DataRow label="Auth user ID" value={<code className="text-xs">{id}</code>} />
          <DataRow label="Account created" value={formatDateTime(detail.authUser?.created_at)} />
          <DataRow label="Last sign-in" value={formatDateTime(detail.authUser?.last_sign_in_at)} />
          <DataRow
            label="Email confirmation"
            value={
              detail.authUser?.email_confirmed_at ? (
                <Pill tone="success">Confirmed {formatDateTime(detail.authUser.email_confirmed_at)}</Pill>
              ) : (
                <Pill tone="warning">Unconfirmed</Pill>
              )
            }
          />
          {detail.authUser?.email && !detail.authUser.email_confirmed_at && (
            <div className="mt-3">
              <ResendVerificationButton userId={id} email={detail.authUser.email} />
            </div>
          )}
        </AdminSection>

        <AdminSection title="Plan">
          <DataRow label="Current plan" value={<PlanPill plan={plan} />} />
          <DataRow label="Subscription status" value={detail.subscription?.status ?? "—"} />
          <DataRow
            label="Renewal / period end"
            value={detail.subscription?.current_period_end ? formatDateTime(detail.subscription.current_period_end) : "—"}
          />
          <p className="mt-3 text-xs text-muted-dim">
            Billing details (price, invoices, lifetime spend) require a billing integration that
            doesn&apos;t exist yet — see System.
          </p>
        </AdminSection>

        <AdminSection title="Grant temporary access">
          <GrantEntitlementForm userId={id} />
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-dim">History</p>
            <GrantsList userId={id} grants={detail.grants} />
          </div>
        </AdminSection>

        <AdminSection title="Organizations">
          {detail.organizations.length === 0 ? (
            <p className="text-sm text-muted-dim">Not a member of any organization.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.organizations.map(({ org, membership }) => (
                <li key={org.id} className="flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-2.5 text-sm">
                  <Link href={`/admin/organizations/${org.id}`} className="flex items-center gap-2 font-medium text-foreground hover:text-accent-strong">
                    <Building2 size={14} className="text-muted-dim" />
                    {org.name}
                  </Link>
                  <Pill>{membership.role}</Pill>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection title="Usage">
          <p className="text-sm text-muted-dim">
            Not tracked yet — no session/activity or product-event data is currently stored for
            any account. See the report&apos;s &quot;Data availability&quot; section for the
            tracking design this would require.
          </p>
        </AdminSection>
      </div>
    </div>
  );
}
