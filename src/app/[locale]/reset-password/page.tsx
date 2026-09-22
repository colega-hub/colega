import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.resetPassword", path: "/reset-password" });
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.resetPassword" });

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footerLinkLabel={t("backToLogin")}
      footerLinkHref="/login"
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
