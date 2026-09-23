import { LogOut, Monitor, Apple, Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ensureProfile } from "@/lib/auth/profile";
import { logout } from "@/lib/auth/actions";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { buildMetadata } from "@/lib/seo";
import { WINDOWS_DOWNLOAD_URL } from "@/lib/download";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.account", path: "/account" });
}

type OrgMembership = {
  role: "owner" | "admin" | "member";
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
};

// Mirrors get_my_entitlement()'s RETURNS TABLE shape — see
// colega/supabase/migrations/0014_entitlements.sql. No generated Database types exist for this
// Supabase project yet (same gap noted in the desktop app's src/supabase/types.ts), so this is
// hand-written, same as that file's Profile/Organization types.
type EntitlementRow = {
  plan: "free" | "pro" | "teams";
  status: string;
  can_use_screen_intelligence: boolean;
  has_unlimited_personal_usage: boolean;
  can_create_company: boolean;
  can_use_personal_rules: boolean;
  current_period_end: string | null;
};

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });

  // Real, server-side authorization boundary — not just hiding UI. getUser() (not getSession())
  // revalidates the token against the Auth server rather than trusting a possibly-stale cookie.
  if (!isSupabaseConfigured) return redirect({ href: "/login", locale });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect({ href: "/login", locale });

  // Lazily repairs a missing profile row — see ensureProfile's doc comment. Covers a website
  // account that signed up while email confirmation was required (profile insert was blocked
  // by RLS at signup time, since there was no session yet) logging in for the first time.
  await ensureProfile(supabase, user);

  const [{ data: profile }, entitlementResult, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_my_entitlement").returns<EntitlementRow[]>().maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, organizations(id, name)")
      .eq("user_id", user.id)
      .returns<OrgMembership[]>(),
  ]);

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email;
  // get_my_entitlement() is SECURITY DEFINER and self-scoped (auth.uid()) — see
  // colega/supabase/migrations/0014_entitlements.sql. A missing/errored result (e.g. the
  // migration isn't applied on this Supabase project yet) degrades to "free" rather than
  // fabricating a plan.
  const plan = entitlementResult.data?.plan;
  const planKey = plan === "pro" || plan === "teams" ? plan : "free";

  const organizations = (memberships ?? [])
    .map((m) => {
      const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
      return org ? { id: org.id, name: org.name, role: m.role } : null;
    })
    .filter((o): o is { id: string; name: string; role: OrgMembership["role"] } => o !== null);

  return (
    <>
      <Navbar />
      <main className="flex-1 pt-32 pb-24 sm:pt-40">
        <Container className="max-w-3xl">
          <Reveal>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 text-muted">{t("subtitle")}</p>
          </Reveal>

          <div className="mt-10 flex flex-col gap-6">
            <section className="card-surface rounded-3xl p-6 sm:p-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-dim">
                {t("sections.account")}
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-dim">{t("nameLabel")}</dt>
                  <dd className="mt-1 text-base text-foreground">{displayName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-dim">{t("emailLabel")}</dt>
                  <dd className="mt-1 text-base text-foreground">{user.email}</dd>
                </div>
              </dl>
            </section>

            <section id="plan" className="card-surface rounded-3xl p-6 sm:p-8 scroll-mt-28">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-dim">
                {t("sections.plan")}
              </h2>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-dim">{t("currentPlan")}</span>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-medium text-accent-strong">
                  {t(`plans.${planKey}`)}
                </span>
              </div>
            </section>

            <section className="card-surface rounded-3xl p-6 sm:p-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-dim">
                {t("sections.download")}
              </h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button href={WINDOWS_DOWNLOAD_URL} variant="outline" className="flex-1" icon={<Monitor size={16} />}>
                  {t("downloadWindows")}
                </Button>
                <Button variant="outline" className="flex-1" icon={<Apple size={16} />} disabled>
                  {t("downloadMac")}
                </Button>
              </div>
            </section>

            <section className="card-surface rounded-3xl p-6 sm:p-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-dim">
                {t("sections.organizations")}
              </h2>
              {organizations.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {organizations.map((org) => (
                    <li
                      key={org.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-3"
                    >
                      <span className="flex items-center gap-2.5 text-sm text-foreground">
                        <Building2 size={16} className="text-muted-dim" />
                        {org.name}
                      </span>
                      <span className="text-xs text-muted-dim">{t(`roles.${org.role}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-dim">{t("organizationsEmpty")}</p>
              )}
            </section>

            <form action={logout}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="ghost" icon={<LogOut size={16} />}>
                {t("logout")}
              </Button>
            </form>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
