/**
 * USD conversion for ranking/baseline math. Providers are always asked for
 * USD explicitly, so the non-USD path is a rare safety net, served by a
 * small static table (approximate mid-2026 rates — fine for ranking, never
 * shown as a converted price to the user).
 */

export const APPROX_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.28,
  PHP: 0.017,
  RUB: 0.011,
  JPY: 0.0065,
  CAD: 0.73,
  AUD: 0.66,
  MXN: 0.055,
  INR: 0.012,
  CNY: 0.14,
  KRW: 0.00073,
  THB: 0.028,
  SGD: 0.75,
  IDR: 0.000062,
  VND: 0.00004,
  TWD: 0.031,
  HKD: 0.128,
  BRL: 0.18,
  COP: 0.00024,
};

export function toUSD(amount: number, currency: string): number {
  const rate = APPROX_USD_RATES[currency.toUpperCase()];
  if (rate === undefined) {
    // Unknown currency: pass through so the offer still ranks somewhere
    // rather than being dropped; the per-offer currency label stays honest.
    return amount;
  }
  return amount * rate;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}
