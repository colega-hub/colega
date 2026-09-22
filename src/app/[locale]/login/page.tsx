import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.login", path: "/login" });
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ confirmed?: string; oauth_error?: string }>;
}) {
  const { locale } = await params;
  const { confirmed, oauth_error: oauthError } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth.login" });

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footerText={t("footerText")}
      footerLinkLabel={t("footerLink")}
      footerLinkHref="/signup"
    >
      <LoginForm showConfirmedBanner={confirmed === "1"} showOAuthError={oauthError === "1"} />
    </AuthCard>
  );
}
