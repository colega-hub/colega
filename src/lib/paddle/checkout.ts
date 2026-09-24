"use server";

import { createClient } from "@/lib/supabase/server";
import { TEAM_BASE_SEATS, TEAM_MAX_SEATS, TEAM_MIN_SEATS } from "@/lib/pricing";
import { getPaddle, isPaddleConfigured } from "./server";
import { getPaddlePrices, type BillingInterval, type PaidPlan } from "./prices";

export type CheckoutResult =
  | { status: "ok"; transactionId: string }
  | { status: "error"; code: "not_signed_in" | "already_subscribed" | "invalid_request" | "unavailable" };

/**
 * Creates the Paddle transaction SERVER-side so custom_data.userId always comes from the
 * authenticated session — never from the browser. The client only receives the transaction ID
 * and opens Paddle.js checkout with it; Paddle copies custom_data onto the resulting
 * subscription, which is how the webhook (src/lib/paddle/sync.ts) maps it back to the user.
 */
export async function createCheckoutTransaction(input: {
  plan: PaidPlan;
  interval: BillingInterval;
  seats?: number;
}): Promise<CheckoutResult> {
  const { plan, interval } = input;
  if ((plan !== "pro" && plan !== "teams") || (interval !== "month" && interval !== "year")) {
    return { status: "error", code: "invalid_request" };
  }

  const seats = plan === "teams" ? Math.trunc(Number(input.seats ?? TEAM_MIN_SEATS)) : 0;
  if (plan === "teams" && !(seats >= TEAM_MIN_SEATS && seats <= TEAM_MAX_SEATS)) {
    return { status: "error", code: "invalid_request" };
  }

  if (!isPaddleConfigured) return { status: "error", code: "unavailable" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: "error", code: "not_signed_in" };

  // Users can read their own row (0014 RLS). A live paid subscription must be changed, not
  // bought twice.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("plan, status, billing_customer_id, billing_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    existing?.billing_subscription_id &&
    existing.plan !== "free" &&
    (existing.status === "active" || existing.status === "trialing" || existing.status === "past_due")
  ) {
    return { status: "error", code: "already_subscribed" };
  }

  try {
    const prices = getPaddlePrices();
    const items: { priceId: string; quantity: number }[] = [{ priceId: prices[plan][interval], quantity: 1 }];
    if (plan === "teams" && seats > TEAM_BASE_SEATS) {
      items.push({ priceId: prices.additionalSeat[interval], quantity: seats - TEAM_BASE_SEATS });
    }

    const paddle = getPaddle();
    const customerId = existing?.billing_customer_id ?? (await findOrCreateCustomer(user.email));
    const transaction = await paddle.transactions.create({
      items,
      customerId,
      customData: { userId: user.id },
    });
    return { status: "ok", transactionId: transaction.id };
  } catch (error) {
    console.error("[paddle] createCheckoutTransaction failed", error instanceof Error ? error.message : error);
    return { status: "error", code: "unavailable" };
  }
}

async function findOrCreateCustomer(email: string): Promise<string> {
  const paddle = getPaddle();
  const [match] = await paddle.customers.list({ email: [email] }).next();
  if (match) return match.id;
  const created = await paddle.customers.create({ email });
  return created.id;
}
