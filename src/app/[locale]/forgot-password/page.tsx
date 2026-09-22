import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.forgotPassword", path: "/forgot-password" });
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.forgotPassword" });

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footerLinkLabel={t("backToLogin")}
      footerLinkHref="/login"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
