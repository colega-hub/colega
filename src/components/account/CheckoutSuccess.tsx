"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { getCheckoutStatus } from "@/lib/paddle/billing-actions";

const POLL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute

/**
 * Post-checkout screen (/account?checkout=success). The webhook, not this redirect, provisions the
 * plan — so until the subscription row exists it shows "preparing your account" and polls.
 */
export function CheckoutSuccess({ initialPlan }: { initialPlan: "pro" | "teams" | null }) {
  const t = useTranslations("account.checkoutSuccess");
  const tPlans = useTranslations("account.billing.planNames");
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (plan || polls >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      const status = await getCheckoutStatus().catch(() => null);
      if (status?.ready && status.plan) {
        setPlan(status.plan);
        router.refresh();
      } else {
        setPolls((n) => n + 1);
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [plan, polls, router]);

  return (
    <section className="card-surface rounded-3xl border border-emerald-500/25 p-6 text-center sm:p-8">
      <CheckCircle2 size={48} className="mx-auto text-emerald-400" aria-hidden />
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h2>

      {plan ? (
        <p className="mt-2 text-muted">{t("planActive", { plan: tPlans(plan) })}</p>
      ) : polls < MAX_POLLS ? (
        <p className="mt-2 flex items-center justify-center gap-2 text-muted" aria-live="polite">
          <Loader2 size={16} className="animate-spin" />
          {t("preparing")}
        </p>
      ) : (
        <p className="mt-2 text-muted" aria-live="polite">
          {t("slow")}
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        <Button href="/download" variant="primary">
          {t("openColega")}
        </Button>
        <p className="text-xs text-muted-dim">{t("openHint")}</p>
      </div>
    </section>
  );
}
