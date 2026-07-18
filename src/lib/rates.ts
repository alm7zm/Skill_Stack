/**
 * Approximate exchange rates for displaying exam costs in the user's currency.
 *
 * Every rate is "how many of this currency to one USD", so conversion goes via
 * USD: amount / rate[from] * rate[to]. Exam costs in the catalog are all USD
 * today, but converting generically means a non-USD cost still renders right.
 *
 * ponytail: a static table, so prices are shown with a "≈" and can drift. To
 * make them live, swap convertCurrency's body for a daily-cached fetch of
 * open.er-api.com/v6/latest/USD and keep this table as the offline fallback.
 * Keep the keys in sync with CURRENCIES in lib/currencies.ts.
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  SAR: 3.75,
  AED: 3.67,
  EGP: 49,
  JPY: 157,
  INR: 83,
  CAD: 1.36,
  AUD: 1.52,
};

/**
 * Convert between two known currencies via USD. Returns null when either side
 * is unknown, so callers fall back to showing the original amount rather than a
 * wrong one.
 */
export function convertCurrency(amount: number, from: string, to: string): number | null {
  const f = USD_RATES[from];
  const t = USD_RATES[to];
  if (f == null || t == null) return null;
  if (from === to) return amount; // exact, and dodges float drift like 250/3.75*3.75
  return (amount / f) * t;
}
