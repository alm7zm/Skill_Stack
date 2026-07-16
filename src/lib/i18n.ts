export const locales = ['en', 'ar'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Cookie set when a visitor picks a language explicitly; outranks Accept-Language. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * Resolve the best supported locale from an Accept-Language header.
 * ponytail: hand-parsed instead of negotiator + intl-localematcher (the two deps
 * the Next docs suggest) — we support 2 locales and ignore regions, so ~10 lines
 * covers it. Add the libs if locale count grows or region matching starts mattering.
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number(q);
      return {
        // "ar-SA" and "ar" both resolve to "ar"; "*" never matches a locale.
        tag: tag.trim().split('-')[0].toLowerCase(),
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const best = ranked.find((entry) => isLocale(entry.tag))?.tag;
  return isLocale(best) ? best : defaultLocale;
}

/** Strip the locale prefix: "/ar/dashboard" -> "/dashboard", "/ar" -> "/". */
export function pathWithoutLocale(pathname: string, locale: Locale): string {
  const rest = pathname.slice(`/${locale}`.length);
  return rest.startsWith('/') ? rest : `/${rest}`;
}
