import { getTranslations } from "next-intl/server";
import { SimplePage } from "@/components/layout/SimplePage";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.terms", path: "/terms" });
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  const paragraphs = t.raw("paragraphs") as string[];

  return (
    <SimplePage eyebrow={t("eyebrow")} title={t("title")}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </SimplePage>
  );
}
