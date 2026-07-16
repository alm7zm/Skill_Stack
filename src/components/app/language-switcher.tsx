'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, localeNames, locales, pathWithoutLocale, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Client-side because it needs the current path to offer "this same page, other
 * language". Renders plain links, so it works before hydration; the click
 * handler only records the preference.
 *
 * Two locales, so this is a toggle rather than a dropdown. Revisit if a third
 * language lands.
 */
export function LanguageSwitcher({
  current,
  label,
  className,
}: {
  current: Locale;
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const rest = pathWithoutLocale(pathname, current);

  return (
    <div className={cn('flex items-center gap-0.5', className)} role="group" aria-label={label}>
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={`/${locale}${rest}`}
            hrefLang={locale}
            aria-current={active ? 'true' : undefined}
            // Remember the choice so a later visit to "/" skips Accept-Language.
            // Not httpOnly on purpose: it is a display preference, and the proxy
            // only ever reads it to pick a locale.
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
            }}
            className={cn(
              'rounded-sm px-2 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-paper-sunken text-ink'
                : 'text-ink-faint hover:text-ink hover:bg-paper-sunken/60'
            )}
          >
            {localeNames[locale]}
          </Link>
        );
      })}
    </div>
  );
}
