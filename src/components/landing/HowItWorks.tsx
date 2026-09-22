import { useTranslations } from "next-intl";
import { stepItems } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";

export function HowItWorks() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how-it-works" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <RevealGroup className="relative mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="absolute left-0 right-0 top-[26px] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent sm:block" />
          {stepItems.map((step, i) => (
            <RevealItem key={step.id}>
              <div className="relative flex flex-col items-start gap-4">
                <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-border-strong bg-background text-accent-strong">
                  <step.icon size={22} strokeWidth={1.75} />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t(`steps.${step.id}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {t(`steps.${step.id}.description`)}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
