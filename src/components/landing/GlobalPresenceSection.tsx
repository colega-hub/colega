"use client";

import { useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import { presenceCountries } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GlowBackground } from "@/components/ui/GlowBackground";
import { Reveal } from "@/components/ui/Reveal";
import { WorldMap } from "@/components/landing/WorldMap";
import { CountryChip } from "@/components/landing/CountryChip";

// Chips whose anchor is far enough from their marker to warrant a thin
// leader line connecting the two (used for the clustered Western Europe
// countries so their labels don't overlap).
const CONNECTOR_THRESHOLD = 3;

export function GlobalPresenceSection() {
  const t = useTranslations("globalPresence");
  const reduceMotion = useReducedMotion();

  return (
    <section id="global-presence" className="relative overflow-hidden py-24 sm:py-32">
      <GlowBackground grid />
      <Container className="relative">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        {/* Desktop / tablet: map with floating chips positioned by geography */}
        <Reveal delay={0.1} className="relative mt-16 hidden md:block">
          <div className="relative mx-auto aspect-[2/1] w-full max-w-4xl">
            <WorldMap className="absolute inset-0 h-full w-full" />

            <svg
              viewBox="0 0 1000 500"
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              {presenceCountries.map((country) => {
                const chipX = country.chipX ?? country.x;
                const chipY = country.chipY ?? country.y - 8;
                const distance = Math.hypot(chipX - country.x, chipY - country.y);
                if (distance < CONNECTOR_THRESHOLD) return null;

                return (
                  <line
                    key={country.id}
                    x1={(chipX / 100) * 1000}
                    y1={(chipY / 100) * 500 + 10}
                    x2={(country.x / 100) * 1000}
                    y2={(country.y / 100) * 500}
                    stroke="rgba(148,168,235,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                );
              })}
            </svg>

            {presenceCountries.map((country, i) => {
              const chipX = country.chipX ?? country.x;
              const chipY = country.chipY ?? country.y - 8;

              return (
                <div
                  key={country.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${chipX}%`, top: `${chipY}%` }}
                >
                  <CountryChip
                    flag={country.flag}
                    name={t(`countries.${country.id}`)}
                    delay={reduceMotion ? 0 : i * 0.06}
                    float={i % 2 === 0}
                  />
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Mobile: simplified map, chips flow horizontally below it */}
        <div className="mt-14 md:hidden">
          <Reveal>
            <div className="relative mx-auto aspect-[2/1] w-full max-w-md opacity-90">
              <WorldMap className="absolute inset-0 h-full w-full" />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="mt-8 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {presenceCountries.map((country) => (
                <div key={country.id} className="snap-start">
                  <CountryChip
                    flag={country.flag}
                    name={t(`countries.${country.id}`)}
                    float={false}
                  />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
