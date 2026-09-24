// Paddle catalog (SANDBOX). Price IDs are environment-scoped: switching NEXT_PUBLIC_PADDLE_ENV to
// "production" also requires replacing every ID below with the live catalog's IDs.
//
// Safe to import from client code — IDs only, no secrets. The server-side checkout action and the
// webhook both read this one table, so a price is always interpreted the same way on both sides.
export type BillingInterval = "month" | "year";
export type PaidPlan = "pro" | "teams";

export const PADDLE_PRICES = {
  pro: {
    month: "pri_01m3amwjagvmpmx1d70dnhpqew",
    year: "pri_01m3ar8jybfx2xyj1vgtg1tx72",
  },
  teams: {
    month: "pri_01m3apascsrvemce6hnf4mwtab",
    year: "pri_01m3ar8kj1fzper17cevk827vz",
  },
  additionalSeat: {
    month: "pri_01m3apfgkh5c0e26ynmkg734wm",
    year: "pri_01m3ar8ktsf6c5myjf4vr0cgck",
  },
} as const;

const PLAN_BY_PRICE_ID = new Map<string, PaidPlan>([
  [PADDLE_PRICES.pro.month, "pro"],
  [PADDLE_PRICES.pro.year, "pro"],
  [PADDLE_PRICES.teams.month, "teams"],
  [PADDLE_PRICES.teams.year, "teams"],
]);

const SEAT_PRICE_IDS = new Set<string>([
  PADDLE_PRICES.additionalSeat.month,
  PADDLE_PRICES.additionalSeat.year,
]);

export function planForPriceId(priceId: string): PaidPlan | null {
  return PLAN_BY_PRICE_ID.get(priceId) ?? null;
}

export function isSeatPriceId(priceId: string): boolean {
  return SEAT_PRICE_IDS.has(priceId);
}
