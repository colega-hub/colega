"use server";

import { getPaddle, isPaddleConfigured } from "./server";
import { getOwnBillingRow } from "./billing";
import { applySubscription } from "./sync";

// Account-page billing actions. None of them accepts an ID: the subscription and customer are
// always resolved server-side from the signed-in user's own subscriptions row, so a user can only
// ever act on their own subscription.

export type BillingActionResult =
  | { status: "ok" }
  | { status: "error"; code: "not_signed_in" | "no_subscription" | "not_allowed" | "unavailable" };

async function ownSubscription(): Promise<
  { error: "not_signed_in" | "no_subscription" | "unavailable" } | { subscriptionId: string }
> {
  const own = await getOwnBillingRow();
  if (!own) return { error: "not_signed_in" };
  if (!own.row?.billing_subscription_id || own.row.plan === "free") return { error: "no_subscription" };
  if (!isPaddleConfigured) return { error: "unavailable" };
  return { subscriptionId: own.row.billing_subscription_id };
}

/** Schedules cancellation for the end of the current period (or trial) — never immediate. */
export async function cancelMySubscription(): Promise<BillingActionResult> {
  const own = await ownSubscription();
  if ("error" in own) return { status: "error", code: own.error };

  try {
    const paddle = getPaddle();
    const current = await paddle.subscriptions.get(own.subscriptionId);
    if (!["active", "trialing", "past_due"].includes(current.status) || current.scheduledChange) {
      return { status: "error", code: "not_allowed" };
    }
    const sub = await paddle.subscriptions.cancel(own.subscriptionId, { effectiveFrom: "next_billing_period" });
    await applySubscription(sub, sub.updatedAt);
    return { status: "ok" };
  } catch (error) {
    console.error("[paddle] cancelMySubscription failed", error instanceof Error ? error.message : error);
    return { status: "error", code: "unavailable" };
  }
}

/** Removes a scheduled cancellation while the paid/trial period is still running. */
export async function resumeMySubscription(): Promise<BillingActionResult> {
  const own = await ownSubscription();
  if ("error" in own) return { status: "error", code: own.error };

  try {
    const paddle = getPaddle();
    const current = await paddle.subscriptions.get(own.subscriptionId);
    if (current.status === "canceled" || current.scheduledChange?.action !== "cancel") {
      return { status: "error", code: "not_allowed" };
    }
    const sub = await paddle.subscriptions.update(own.subscriptionId, { scheduledChange: null });
    await applySubscription(sub, sub.updatedAt);
    return { status: "ok" };
  } catch (error) {
    console.error("[paddle] resumeMySubscription failed", error instanceof Error ? error.message : error);
    return { status: "error", code: "unavailable" };
  }
}

/** Mints a fresh, one-time Paddle customer portal URL (payment method, invoices). */
export async function openBillingPortal(): Promise<
  { status: "ok"; url: string } | { status: "error"; code: "not_signed_in" | "no_subscription" | "unavailable" }
> {
  const own = await getOwnBillingRow();
  if (!own) return { status: "error", code: "not_signed_in" };
  const customerId = own.row?.billing_customer_id;
  if (!customerId) return { status: "error", code: "no_subscription" };
  if (!isPaddleConfigured) return { status: "error", code: "unavailable" };

  try {
    const subscriptionIds = own.row?.billing_subscription_id ? [own.row.billing_subscription_id] : [];
    const session = await getPaddle().customerPortalSessions.create(customerId, subscriptionIds);
    return { status: "ok", url: session.urls.general.overview };
  } catch (error) {
    console.error("[paddle] openBillingPortal failed", error instanceof Error ? error.message : error);
    return { status: "error", code: "unavailable" };
  }
}

/** Polled by the post-checkout success screen until the webhook has written the subscription. */
export async function getCheckoutStatus(): Promise<{ ready: boolean; plan: "pro" | "teams" | null }> {
  const own = await getOwnBillingRow();
  const row = own?.row;
  const ready =
    !!row?.billing_subscription_id &&
    row.plan !== "free" &&
    (row.status === "active" || row.status === "trialing");
  return { ready, plan: ready && row && row.plan !== "free" ? row.plan : null };
}
