"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TiltCard } from "@/components/ui/TiltCard";
import { TeamSeatSelector } from "@/components/pricing/TeamSeatSelector";
import { CheckoutButton } from "@/components/pricing/CheckoutButton";
import { cn } from "@/lib/utils";
import { getTeamPrice, TEAM_MIN_SEATS } from "@/lib/pricing";
import type { Plan } from "@/lib/data";

export function PricingCard({
  plan,
  annual,
}: {
  plan: Plan;
  annual: boolean;
}) {
  const t = useTranslations("pricing");
  const [seats, setSeats] = useState(TEAM_MIN_SEATS);

  const isTeam = plan.id === "team";
  const isEnterprise = plan.id === "enterprise";
  const price = isTeam ? getTeamPrice(seats, annual) : annual ? plan.priceAnnual : plan.priceMonthly;
  const features = t.raw(`plans.${plan.id}.features`) as string[];

  return (
    <TiltCard
      className={cn(
        "group flex h-full flex-col rounded-3xl p-7 sm:p-8",
        plan.popular
          ? "border border-accent/40 bg-gradient-to-b from-accent/[0.12] to-transparent shadow-[0_0_0_1px_rgba(91,124,250,0.15)_inset,0_30px_60px_-20px_rgba(91,124,250,0.35)]"
          : "card-surface"
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <Badge variant="accent">{t("mostPopular")}</Badge>
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground">
        {t(`plans.${plan.id}.name`)}
      </h3>
      <p className="mt-1.5 text-sm text-muted">{t(`plans.${plan.id}.tagline`)}</p>

      <div className="mt-6 flex items-baseline gap-1.5 overflow-hidden">
        {isEnterprise ? (
          <span className="text-4xl font-semibold tracking-tight text-foreground">
            {t("priceCustom")}
          </span>
        ) : price === "Free" ? (
          <span className="text-4xl font-semibold tracking-tight text-foreground">
            {price}
          </span>
        ) : (
          <>
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              $
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={price}
                  className="inline-block"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {price}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="text-sm text-muted-dim">{plan.unit}</span>
          </>
        )}
      </div>
      {!isEnterprise && price !== "Free" && annual && (
        <p className="mt-1 text-xs text-muted-dim">{t("billing.billedAnnually")}</p>
      )}

      {isTeam && <TeamSeatSelector seats={seats} onChange={setSeats} />}

      {plan.id === "pro" || isTeam ? (
        <CheckoutButton
          plan={isTeam ? "teams" : "pro"}
          annual={annual}
          seats={isTeam ? seats : undefined}
          label={t(`plans.${plan.id}.cta`)}
          variant={plan.popular ? "primary" : "outline"}
        />
      ) : (
        <Button
          href={isEnterprise ? "/contact" : "/signup"}
          className="mt-7 w-full"
          variant={plan.popular ? "primary" : "outline"}
          icon={isEnterprise ? <MessageCircle size={15} /> : <ArrowRight size={15} />}
        >
          {t(`plans.${plan.id}.cta`)}
        </Button>
      )}

      <ul className="mt-8 flex flex-col gap-3.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-muted">
            <Check size={16} className="mt-0.5 shrink-0 text-accent-strong" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </TiltCard>
  );
}
