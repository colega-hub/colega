import { useTranslations } from "next-intl";
import { ArrowRight, Download } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal } from "@/components/ui/Reveal";

export function FinalCTA() {
  const t = useTranslations("finalCta");
  const titleLines = t("title").split("\n");

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <GlowBackground variant="hero" />
      <Container className="relative">
        <div className="card-surface relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-24">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-gradient sm:text-4xl md:text-5xl">
              {titleLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              {t("description")}
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button href="/signup" size="lg" icon={<ArrowRight size={16} />}>
                {t("ctaPrimary")}
              </Button>
              <Button
                href="/download"
                variant="outline"
                size="lg"
                icon={<Download size={16} />}
              >
                {t("ctaSecondary")}
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
