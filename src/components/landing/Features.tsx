"use client";

import { useTranslations } from "next-intl";
import { featureItems } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { NudgeDemo, MemoryDemo, TeachDemo } from "@/components/landing/FeatureDemos";
import { TiltCard } from "@/components/ui/TiltCard";

export function Features() {
  const t = useTranslations("features");

  return (
    <section id="features" className="relative py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <RevealGroup className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featureItems.map((feature) => (
            <RevealItem key={feature.id}>
              <TiltCard className="card-surface group relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-colors hover:border-white/[0.16]">
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: "rgba(91,124,250,0.35)" }}
                />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-accent-strong">
                  <feature.icon size={20} strokeWidth={1.75} />
                </div>

                {feature.kind === "nudge" && (
                  <span className="relative mt-5 text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
                    {t(`items.${feature.id}.kicker`)}
                  </span>
                )}

                <h3
                  className={`relative text-base font-semibold text-foreground ${
                    feature.kind === "nudge" ? "mt-1.5" : "mt-5"
                  }`}
                >
                  {t(`items.${feature.id}.title`)}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">
                  {t(`items.${feature.id}.description`)}
                </p>

                <div className="relative mt-auto">
                  {feature.kind === "nudge" && <NudgeDemo />}
                  {feature.kind === "memory" && <MemoryDemo />}
                  {feature.kind === "teach" && <TeachDemo />}
                </div>
              </TiltCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}
