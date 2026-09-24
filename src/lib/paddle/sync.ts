import "server-only";

import { EventName, type EventEntity } from "@paddle/paddle-node-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaddle } from "./server";
import { isSeatPriceId, planForPriceId, type PaidPlan } from "./prices";

// Mirrors Paddle subscription state into public.subscriptions (0014 + 0031). The ONLY writer of
// that table's billing columns. Every path here is an idempotent upsert keyed on user_id, so a
// redelivered event (same eventId) converges to the same row.

type DbStatus = "active" | "trialing" | "past_due" | "cancelled";

// Structural subset shared by SubscriptionNotification (webhook payload) and Subscription (API).
type PaddleSubscriptionLike = {
  id: string;
  status: "active" | "canceled" | "past_due" | "paused" | "trialing";
  customerId: string;
  customData: Record<string, unknown> | null;
  currentBillingPeriod: { endsAt: string } | null;
  scheduledChange: { action: string } | null;
  items: { quantity: number; price: { id: string } | null }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapStatus(status: PaddleSubscriptionLike["status"]): DbStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return status;
    // The DB check constraint (0014) spells it "cancelled" and has no "paused" — a paused
    // subscription grants nothing, so it is stored as cancelled (fail closed).
    case "canceled":
    case "paused":
      return "cancelled";
  }
}

function userIdFromCustomData(customData: Record<string, unknown> | null): string | null {
  const value = customData?.userId;
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

type ExistingRow = {
  user_id: string;
  status: DbStatus;
  billing_subscription_id: string | null;
  billing_event_at: string | null;
};

async function findExistingRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  subscriptionId: string,
  customerId: string
): Promise<ExistingRow | null> {
  const columns = "user_id, status, billing_subscription_id, billing_event_at";
  const byUser = userId
    ? await admin.from("subscriptions").select(columns).eq("user_id", userId).maybeSingle<ExistingRow>()
    : null;
  if (byUser?.error) throw byUser.error;
  if (byUser?.data) return byUser.data;
  if (userId) return null;

  // No trustworthy userId on the payload: fall back to IDs a previous event already stored.
  for (const [column, value] of [
    ["billing_subscription_id", subscriptionId],
    ["billing_customer_id", customerId],
  ] as const) {
    const { data, error } = await admin
      .from("subscriptions")
      .select(columns)
      .eq(column, value)
      .limit(1)
      .maybeSingle<ExistingRow>();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function applySubscription(sub: PaddleSubscriptionLike, occurredAt: string) {
  const admin = createAdminClient();
  const payloadUserId = userIdFromCustomData(sub.customData);
  const existing = await findExistingRow(admin, payloadUserId, sub.id, sub.customerId);
  const userId = payloadUserId ?? existing?.user_id ?? null;

  if (!userId) {
    // Not ours to map (e.g. a simulator payload or a subscription created outside this site's
    // checkout). Retrying can't fix it, so it is acknowledged and logged.
    console.warn("[paddle] subscription without a resolvable user", { subscriptionId: sub.id });
    return;
  }

  // Paddle does not deliver in order — never let an older event overwrite newer state.
  if (existing?.billing_event_at && new Date(existing.billing_event_at) > new Date(occurredAt)) {
    return;
  }

  const status = mapStatus(sub.status);

  // A late cancellation of a PREVIOUS subscription must not clobber a newer live one.
  if (
    existing?.billing_subscription_id &&
    existing.billing_subscription_id !== sub.id &&
    (existing.status === "active" || existing.status === "trialing") &&
    status === "cancelled"
  ) {
    return;
  }

  let plan: PaidPlan | null = null;
  let additionalSeats = 0;
  for (const item of sub.items) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    plan = planForPriceId(priceId) ?? plan;
    if (isSeatPriceId(priceId)) additionalSeats += item.quantity;
  }

  if (!plan) {
    console.warn("[paddle] subscription has no known plan price", { subscriptionId: sub.id });
    return;
  }

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status,
      billing_provider: "paddle",
      billing_customer_id: sub.customerId,
      billing_subscription_id: sub.id,
      current_period_end: sub.currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: sub.scheduledChange?.action === "cancel",
      additional_seats: plan === "teams" && status !== "cancelled" ? additionalSeats : 0,
      billing_event_at: occurredAt,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function processPaddleEvent(event: EventEntity) {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
      return applySubscription(event.data, event.occurredAt);

    case EventName.TransactionCompleted: {
      // Safety net if a subscription.* delivery was lost: re-read the subscription's current
      // state from the API and apply it through the same convergent path.
      const subscriptionId = event.data.subscriptionId;
      if (!subscriptionId) return;
      const sub = await getPaddle().subscriptions.get(subscriptionId);
      return applySubscription(sub, event.occurredAt);
    }

    default:
      return;
  }
}
