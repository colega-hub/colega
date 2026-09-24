import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getPaddle, isPaddleConfigured } from "./server";

// Read side of the account page's subscription card. Ownership comes ONLY from the signed-in
// user's own subscriptions row (RLS: users read their own row, 0014) — no subscription or customer
// ID is ever taken from the browser.

export type OwnBillingRow = {
  plan: "free" | "pro" | "teams";
  status: "active" | "trialing" | "past_due" | "cancelled";
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  additional_seats: number;
};

export type SubscriptionSummary = {
  plan: "pro" | "teams";
  status: "active" | "trialing" | "past_due" | "cancelled";
  interval: "month" | "year" | null;
  seats: number | null;
  /** Next charge, in the currency's lowest unit (cents for USD), incl. seats and tax. */
  nextAmount: string | null;
  currency: string | null;
  /** Renewal date, or the trial end while trialing. */
  nextBilledAt: string | null;
  /** Set when a cancellation is scheduled: access continues until this date. */
  cancelEffectiveAt: string | null;
  /** False when Paddle couldn't be reached and the card is built from the mirrored row only. */
  live: boolean;
};

export async function getOwnBillingRow(): Promise<{ userId: string; row: OwnBillingRow | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select(
      "plan, status, billing_customer_id, billing_subscription_id, current_period_end, cancel_at_period_end, additional_seats"
    )
    .eq("user_id", user.id)
    .maybeSingle<OwnBillingRow>();
  return { userId: user.id, row: data ?? null };
}

export async function getSubscriptionSummary(row: OwnBillingRow | null): Promise<SubscriptionSummary | null> {
  if (!row?.billing_subscription_id || row.plan === "free") return null;

  const fallback: SubscriptionSummary = {
    plan: row.plan,
    status: row.status,
    interval: null,
    seats: row.plan === "teams" ? 3 + row.additional_seats : null,
    nextAmount: null,
    currency: null,
    nextBilledAt: row.status === "cancelled" || row.cancel_at_period_end ? null : row.current_period_end,
    cancelEffectiveAt: row.cancel_at_period_end ? row.current_period_end : null,
    live: false,
  };
  if (!isPaddleConfigured) return fallback;

  try {
    const sub = await getPaddle().subscriptions.get(row.billing_subscription_id, {
      include: ["next_transaction"],
    });
    const cancelScheduled = sub.scheduledChange?.action === "cancel";
    const totals = sub.nextTransaction?.details.totals;
    return {
      plan: row.plan,
      status: row.status,
      interval: sub.billingCycle.interval === "year" ? "year" : "month",
      seats: fallback.seats,
      nextAmount: cancelScheduled ? null : (totals?.grandTotal ?? null),
      currency: totals?.currencyCode ?? sub.currencyCode,
      nextBilledAt: cancelScheduled ? null : sub.nextBilledAt,
      cancelEffectiveAt: cancelScheduled ? sub.scheduledChange!.effectiveAt : null,
      live: true,
    };
  } catch (error) {
    console.error("[paddle] getSubscriptionSummary failed", error instanceof Error ? error.message : error);
    return fallback;
  }
}
