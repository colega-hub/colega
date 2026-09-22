import { Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SimplePage } from "@/components/layout/SimplePage";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.contact", path: "/contact" });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.contact" });

  return (
    <SimplePage eyebrow={t("eyebrow")} title={t("title")}>
      <p>{t("paragraph")}</p>
      <a
        href={`mailto:${t("email")}`}
        className="inline-flex items-center gap-2 font-medium text-accent-strong hover:text-foreground"
      >
        <Mail size={16} />
        {t("email")}
      </a>
    </SimplePage>
  );
}
