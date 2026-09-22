import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";

export async function buildMetadata({
  locale,
  namespace,
  path,
}: {
  locale: string;
  namespace: string;
  path: string;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });

  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates(path, locale),
  };
}
