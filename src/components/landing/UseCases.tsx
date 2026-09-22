import { useTranslations } from "next-intl";
import { useCaseItems } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { TiltCard } from "@/components/ui/TiltCard";

export function UseCases() {
  const t = useTranslations("useCases");

  return (
    <section id="use-cases" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <RevealGroup className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCaseItems.map((useCase) => (
            <RevealItem key={useCase.id}>
              <TiltCard className="card-surface group flex h-full flex-col gap-4 rounded-2xl p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-accent-strong">
                  <useCase.icon size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {t(`items.${useCase.id}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {t(`items.${useCase.id}.description`)}
                  </p>
                </div>
              </TiltCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
