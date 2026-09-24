"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { usePaddle } from "@/hooks/usePaddle";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { createCheckoutTransaction } from "@/lib/paddle/checkout";
import type { PaidPlan } from "@/lib/paddle/prices";

export function CheckoutButton({
  plan,
  annual,
  seats,
  label,
  variant,
}: {
  plan: PaidPlan;
  annual: boolean;
  seats?: number;
  label: string;
  variant: "primary" | "outline";
}) {
  const t = useTranslations("pricing.checkout");
  const locale = useLocale();
  const router = useRouter();
  const paddle = usePaddle();
  const { user, loading } = useSupabaseUser();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function goToLogin() {
    router.push({ pathname: "/login", query: { next: "/pricing" } });
  }

  function handleClick() {
    setError(null);
    if (!user) return goToLogin();

    startTransition(async () => {
      const result = await createCheckoutTransaction({
        plan,
        interval: annual ? "year" : "month",
        seats,
      });
      if (result.status === "error") {
        if (result.code === "not_signed_in") return goToLogin();
        setError(t(`errors.${result.code}`));
        return;
      }
      if (!paddle) {
        setError(t("errors.unavailable"));
        return;
      }
      paddle.Checkout.open({
        transactionId: result.transactionId,
        settings: {
          variant: "one-page",
          locale,
          allowLogout: false,
          successUrl: `${window.location.origin}/${locale}/account?checkout=success`,
        },
      });
    });
  }

  return (
    <div className="mt-7">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending || loading || (!!user && !paddle)}
        className="w-full"
        variant={variant}
        icon={<ArrowRight size={15} />}
      >
        {pending ? t("loading") : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
