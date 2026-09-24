"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  cancelMySubscription,
  openBillingPortal,
  resumeMySubscription,
  type BillingActionResult,
} from "@/lib/paddle/billing-actions";
import type { SubscriptionSummary } from "@/lib/paddle/billing";

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function formatAmount(minor: string | null, currency: string | null, locale: string) {
  if (!minor || !currency) return null;
  // USD (the only catalog currency) has 2 decimal places.
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(minor) / 100);
}

const statusTone: Record<SubscriptionSummary["status"], string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  trialing: "border-accent/30 bg-accent/10 text-accent-strong",
  past_due: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function SubscriptionCard({ summary }: { summary: SubscriptionSummary }) {
  const t = useTranslations("account.billing");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = formatAmount(summary.nextAmount, summary.currency, locale);
  const cancelScheduled = !!summary.cancelEffectiveAt;
  const canCancel = !cancelScheduled && summary.status !== "cancelled";
  const statusKey = cancelScheduled ? "cancelScheduled" : summary.status;

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirmOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  function run(action: () => Promise<BillingActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      setConfirmOpen(false);
      if (result.status === "error") {
        setError(t(`errors.${result.code}`));
        return;
      }
      router.refresh();
    });
  }

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const result = await openBillingPortal();
      if (result.status === "error") {
        setError(t(`errors.${result.code}`));
        return;
      }
      window.location.href = result.url;
    });
  }

  let detail: string | null = null;
  if (cancelScheduled) {
    detail = t("accessUntil", { date: formatDate(summary.cancelEffectiveAt, locale) });
  } else if (summary.status === "trialing") {
    detail = amount
      ? t("trialEnds", { date: formatDate(summary.nextBilledAt, locale), amount })
      : t("trialEndsNoAmount", { date: formatDate(summary.nextBilledAt, locale) });
  } else if (summary.status === "active" || summary.status === "past_due") {
    detail = summary.nextBilledAt ? t("renews", { date: formatDate(summary.nextBilledAt, locale) }) : null;
  } else {
    detail = t("cancelledDetail");
  }

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-foreground">
            {t(`planNames.${summary.plan}`)}
            {summary.seats ? (
              <span className="ml-2 text-sm font-normal text-muted-dim">{t("seats", { count: summary.seats })}</span>
            ) : null}
          </p>
          {amount && !cancelScheduled && summary.status !== "cancelled" && (
            <p className="mt-1 text-sm text-muted">
              {amount} / {t(summary.interval === "year" ? "perYear" : "perMonth")}
            </p>
          )}
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", statusTone[summary.status])}>
          {t(`status.${statusKey}`)}
        </span>
      </div>

      {detail && <p className="text-sm text-muted">{detail}</p>}
      {summary.status === "past_due" && <p className="text-sm text-amber-400">{t("pastDueHint")}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="flex-1" icon={<CreditCard size={16} />} onClick={openPortal} disabled={pending}>
          {t("portal")}
        </Button>
        {canCancel && (
          <Button type="button" variant="ghost" className="flex-1" icon={<XCircle size={16} />} onClick={() => setConfirmOpen(true)} disabled={pending}>
            {t("cancel")}
          </Button>
        )}
        {cancelScheduled && summary.status !== "cancelled" && (
          <Button type="button" variant="ghost" className="flex-1" icon={<RotateCcw size={16} />} onClick={() => run(resumeMySubscription)} disabled={pending}>
            {pending ? t("working") : t("resume")}
          </Button>
        )}
        {summary.status === "cancelled" && (
          <Button href="/pricing" variant="primary" className="flex-1">
            {t("resubscribe")}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !pending && setConfirmOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-title"
              className="card-surface w-full max-w-md rounded-3xl bg-background p-6 sm:p-8"
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="cancel-title" className="text-lg font-semibold text-foreground">
                {t("confirmTitle")}
              </h3>
              <p className="mt-3 text-sm text-muted">
                {t("confirmBody", {
                  date: formatDate(summary.nextBilledAt ?? summary.cancelEffectiveAt, locale),
                })}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
                  {t("confirmKeep")}
                </Button>
                <Button type="button" variant="primary" onClick={() => run(cancelMySubscription)} disabled={pending}>
                  {pending ? t("working") : t("confirmCancel")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
