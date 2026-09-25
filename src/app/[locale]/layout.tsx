import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/i18n/alternates";
import { siteUrl } from "@/lib/supabase/site-url";
import { SmartScreenGuide } from "@/components/download/SmartScreenGuide";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.home" });

  return {
    // Resolves every relative URL in this metadata tree (alternates/canonical below, and any
    // page's own open-graph/twitter images) against the real deploy — production domain once
    // set, otherwise Netlify's own *.netlify.app URL, otherwise localhost. Without this, Next
    // can't turn `alternates.canonical`'s relative "/en" into an absolute URL for production.
    metadataBase: new URL(siteUrl),
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/", locale),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-accent">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <MotionConfig reducedMotion="user">
            {children}
            <SmartScreenGuide />
          </MotionConfig>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
