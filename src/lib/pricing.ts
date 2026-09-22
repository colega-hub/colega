// Team plan seat pricing. Keep in sync with messages/*.json pricing.team copy.
export const TEAM_BASE_PRICE = 39;
export const TEAM_BASE_SEATS = 3;
export const TEAM_PRICE_PER_SEAT = 5;
export const TEAM_MIN_SEATS = 3;
export const TEAM_MAX_SEATS = 30;
export const ANNUAL_DISCOUNT = 0.2;

export function getTeamMonthlyPrice(seats: number): number {
  return TEAM_BASE_PRICE + (seats - TEAM_BASE_SEATS) * TEAM_PRICE_PER_SEAT;
}

export function getTeamAnnualMonthlyPrice(seats: number): number {
  return Math.round(getTeamMonthlyPrice(seats) * (1 - ANNUAL_DISCOUNT));
}

export function getTeamPrice(seats: number, annual: boolean): number {
  return annual ? getTeamAnnualMonthlyPrice(seats) : getTeamMonthlyPrice(seats);
}
