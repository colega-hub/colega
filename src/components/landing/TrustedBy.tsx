import { useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/Reveal";
import { Container } from "@/components/ui/Container";
import { trustedLogos } from "@/lib/data";

export function TrustedBy() {
  const t = useTranslations("trustedBy");

  return (
    <section className="relative py-14 sm:py-20">
      <Container>
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">
            {t("eyebrow")}
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-80">
            {trustedLogos.map((logo) => (
              <span
                key={logo}
                className="text-lg font-semibold tracking-tight text-muted-dim/80 transition-colors hover:text-muted"
              >
                {logo}
              </span>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
