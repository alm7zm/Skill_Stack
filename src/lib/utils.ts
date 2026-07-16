import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Locale } from './i18n';
import type { Difficulty } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------------------------------------------------------------------
 * Formatting
 * All of these take a locale. Intl then renders Arabic-Indic digits, Arabic
 * month names and RTL-correct currency placement for free — which is why none
 * of them hardcode 'en-US' any more.
 * ------------------------------------------------------------------------ */

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCurrency(amount: number, locale: Locale, currency = 'USD'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

/**
 * "40 hours" -> "1 week", pluralising the unit itself.
 *
 * The unit has to agree with the number, and Arabic does not simply add an "s":
 * 3-10 takes a broken plural ("5 أسابيع") while 11-99 takes the singular
 * ("40 أسبوعًا"). Passing a single fixed word produced "3 أسبوع", which is wrong.
 */
export function formatStudyTime(
  hours: number,
  locale: Locale,
  unit: { hours: Record<string, string>; weeks: Record<string, string> }
): string {
  if (hours <= 40) return `${formatNumber(hours, locale)} ${pluralUnit(unit.hours, hours, locale)}`;
  const weeks = Math.round(hours / 40);
  return `${formatNumber(weeks, locale)} ${pluralUnit(unit.weeks, weeks, locale)}`;
}

/** The unit word alone, without the number in front of it. */
export function pluralUnit(forms: Record<string, string>, count: number, locale: Locale): string {
  const rule = new Intl.PluralRules(locale).select(count);
  return forms[rule] ?? forms.other;
}

/**
 * Pick the right plural form for a locale.
 * Arabic has six categories (zero/one/two/few/many/other), English has two.
 * Intl.PluralRules knows which apply, so dictionaries just supply all six and
 * the unused ones are never read.
 */
export function plural(
  forms: Record<string, string>,
  count: number,
  locale: Locale
): string {
  const rule = new Intl.PluralRules(locale).select(count);
  const template = forms[rule] ?? forms.other;
  return template.replace('{count}', formatNumber(count, locale));
}

/** Fill {placeholders} in a dictionary string. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match
  );
}

/* ---------------------------------------------------------------------------
 * Difficulty
 * The old getDifficultyColor/getDifficultyBg mapped each level to its own hue
 * (emerald/amber/orange/red). That is four extra accents in a one-accent system,
 * and colour alone is not an accessible way to encode an ordinal scale anyway.
 * Difficulty is now rendered as a 4-step meter — see components/ui/difficulty-meter.
 * ------------------------------------------------------------------------ */

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
];

/** 1-4. Used to fill the meter. */
export function difficultyLevel(difficulty: Difficulty): number {
  return DIFFICULTY_ORDER.indexOf(difficulty) + 1;
}

/* ---------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------ */

/** Was Math.random().toString(36) — collision-prone and not a real id. */
export function generateId(): string {
  return crypto.randomUUID();
}
