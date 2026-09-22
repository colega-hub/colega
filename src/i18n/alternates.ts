import { routing } from "./routing";

/**
 * Builds hreflang/canonical alternates for a given app pathname (locale-free,
 * e.g. "/pricing" or "/"). Used in each page's generateMetadata.
 */
export function localeAlternates(pathname: string, currentLocale: string) {
  const suffix = pathname === "/" ? "" : pathname;
  const languages: Record<string, string> = {};

  for (const locale of routing.locales) {
    languages[locale] = `/${locale}${suffix}`;
  }
  languages["x-default"] = `/${routing.defaultLocale}${suffix}`;

  return {
    canonical: `/${currentLocale}${suffix}`,
    languages,
  };
}
