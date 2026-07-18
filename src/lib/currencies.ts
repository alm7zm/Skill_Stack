/**
 * Currencies a user can hold their learning budget in. ISO 4217 codes, which
 * Intl.NumberFormat renders with the right symbol per locale, so no separate
 * label list is needed. Shared by the profile form and its validation.
 */
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP', 'JPY', 'INR', 'CAD', 'AUD',
] as const;

export type Currency = (typeof CURRENCIES)[number];
