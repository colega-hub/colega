"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { plans } from "@/lib/data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { PricingCard } from "@/components/pricing/PricingCard";
import { BillingToggle } from "@/components/pricing/BillingToggle";

export function PricingSection({
  showHeading = true,
  id = "pricing",
}: {
  showHeading?: boolean;
  id?: string;
}) {
  const t = useTranslations("pricing");
  const [annual, setAnnual] = useState(false);

  return (
    <section id={id} className="relative py-24 sm:py-32">
      <Container>
        {showHeading && (
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            description={t("description")}
          />
        )}

        <Reveal delay={0.1} className="mt-10 flex justify-center">
          <BillingToggle annual={annual} onChange={setAnnual} />
        </Reveal>

        <RevealGroup className="mx-auto mt-12 grid max-w-6xl grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <RevealItem key={plan.id}>
              <PricingCard plan={plan} annual={annual} />
            </RevealItem>
          ))}
        </RevealGroup>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-dim">
          {t.rich("legalNote.text", {
            terms: (chunks) => (
              <Link href="/terms" className="underline hover:text-foreground">
                {chunks}
              </Link>
            ),
            refund: (chunks) => (
              <Link href="/refund" className="underline hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Container>
    </section>
  );
}
