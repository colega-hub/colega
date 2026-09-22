import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.signup", path: "/signup" });
}

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signup" });

  const agreement = t.rich("agreement", {
    terms: (chunks) => (
      <Link href="/terms" className="text-muted hover:text-foreground">
        {chunks}
      </Link>
    ),
    privacy: (chunks) => (
      <Link href="/privacy" className="text-muted hover:text-foreground">
        {chunks}
      </Link>
    ),
  });

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footerText={t("footerText")}
      footerLinkLabel={t("footerLink")}
      footerLinkHref="/login"
    >
      <SignupForm agreement={agreement} />
    </AuthCard>
  );
}
