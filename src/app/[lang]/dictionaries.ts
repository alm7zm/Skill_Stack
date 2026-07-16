import type { Locale } from '@/lib/i18n';

/**
 * ponytail: no `server-only` package and no i18n library. Dictionaries are loaded
 * in server components and the strings they need are passed down as props, so
 * none of this JSON reaches the client bundle. Add `server-only` if that
 * discipline ever needs enforcing at build time rather than by review.
 */
const dictionaries = {
  en: () => import('./dictionaries/en.json').then((m) => m.default),
  ar: () => import('./dictionaries/ar.json').then((m) => m.default),
};

/** Shape of every dictionary. en and ar are kept key-for-key identical. */
export type Dictionary = Awaited<ReturnType<typeof dictionaries.en>>;

export const getDictionary = async (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();
