import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal } from "@/components/ui/Reveal";
import { PricingSection } from "@/components/pricing/PricingSection";
import { ComparisonTable } from "@/components/pricing/ComparisonTable";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildMetadata({ locale, namespace: "meta.pricing", path: "/pricing" });
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden pt-36 pb-8 sm:pt-44">
          <GlowBackground variant="hero" grid />
          <Container className="relative text-center">
            <Reveal>
              <Badge variant="accent">{t("eyebrow")}</Badge>
            </Reveal>
            <Reveal delay={0.06}>
              <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-gradient sm:text-5xl md:text-6xl">
                {t("heroTitle")}
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
                {t("heroDescription")}
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-8 flex justify-center">
                <Button href="/signup" icon={<ArrowRight size={16} />}>
                  {t("heroCta")}
                </Button>
              </div>
            </Reveal>
          </Container>
        </section>

        <PricingSection showHeading={false} />
        <ComparisonTable />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
