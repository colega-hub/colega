import "server-only";

// Paddle catalog price IDs, read from SERVER-ONLY env vars so switching sandbox <-> live is purely
// an environment change (NEXT_PUBLIC_PADDLE_ENV + keys + these six IDs), never a code change.
// The checkout action and the webhook both resolve prices through this one module, so a price is
// always interpreted the same way on both sides.
//
// Fallback: in SANDBOX only, a missing variable falls back to the sandbox catalog below. In
// production a missing variable throws — a live deploy must never silently sell sandbox IDs.
export type BillingInterval = "month" | "year";
export type PaidPlan = "pro" | "teams";

const SANDBOX_DEFAULTS = {
  PADDLE_PRICE_PRO_MONTH: "pri_01m3amwjagvmpmx1d70dnhpqew",
  PADDLE_PRICE_PRO_YEAR: "pri_01m3ar8jybfx2xyj1vgtg1tx72",
  PADDLE_PRICE_TEAMS_MONTH: "pri_01m3apascsrvemce6hnf4mwtab",
  PADDLE_PRICE_TEAMS_YEAR: "pri_01m3ar8kj1fzper17cevk827vz",
  PADDLE_PRICE_SEAT_MONTH: "pri_01m3apfgkh5c0e26ynmkg734wm",
  PADDLE_PRICE_SEAT_YEAR: "pri_01m3ar8ktsf6c5myjf4vr0cgck",
} as const;

type PriceVar = keyof typeof SANDBOX_DEFAULTS;

function priceId(name: PriceVar): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NEXT_PUBLIC_PADDLE_ENV !== "production") return SANDBOX_DEFAULTS[name];
  throw new Error(`${name} is not configured for the production Paddle environment.`);
}

export function getPaddlePrices() {
  return {
    pro: { month: priceId("PADDLE_PRICE_PRO_MONTH"), year: priceId("PADDLE_PRICE_PRO_YEAR") },
    teams: { month: priceId("PADDLE_PRICE_TEAMS_MONTH"), year: priceId("PADDLE_PRICE_TEAMS_YEAR") },
    additionalSeat: { month: priceId("PADDLE_PRICE_SEAT_MONTH"), year: priceId("PADDLE_PRICE_SEAT_YEAR") },
  };
}

export function planForPriceId(id: string): PaidPlan | null {
  const prices = getPaddlePrices();
  if (id === prices.pro.month || id === prices.pro.year) return "pro";
  if (id === prices.teams.month || id === prices.teams.year) return "teams";
  return null;
}

export function isSeatPriceId(id: string): boolean {
  const { additionalSeat } = getPaddlePrices();
  return id === additionalSeat.month || id === additionalSeat.year;
}
