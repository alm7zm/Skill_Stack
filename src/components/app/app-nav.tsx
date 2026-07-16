'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { cn } from '@/lib/utils';
import { pathWithoutLocale, type Locale } from '@/lib/i18n';

/**
 * A masthead, not a sidebar.
 *
 * The old shell had a collapsible left sidebar AND a top bar AND a mobile bottom
 * nav AND an overlay drawer — four navigation surfaces to keep in sync, in a
 * layout that every dashboard already uses. One horizontal masthead is less code,
 * gives the content its full width, and suits the editorial type.
 *
 * Client component because it needs the active path. The only state is the
 * mobile menu.
 */
export function AppNav({
  lang,
  labels,
  user,
  avatar,
}: {
  lang: Locale;
  labels: {
    home: string;
    discover: string;
    dashboard: string;
    profile: string;
    settings: string;
    switchLanguage: string;
    openMenu: string;
    closeMenu: string;
    signIn: string;
  };
  user: { name: string | null; email: string } | null;
  avatar: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const here = pathWithoutLocale(pathname, lang);

  // /search and /certification are public, so a signed-out visitor can land
  // here. Offering Home and Dashboard to someone who would just be bounced to
  // the login screen is a dead end dressed up as navigation.
  const items = user
    ? [
        { href: '/home', label: labels.home },
        { href: '/search', label: labels.discover },
        { href: '/dashboard', label: labels.dashboard },
      ]
    : [{ href: '/search', label: labels.discover }];

  const isActive = (href: string) => here === href || here.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Logo href={`/${lang}/home`} size="md" />

        {/* Primary nav — underline marks the current page, so it survives
            greyscale and does not rely on colour alone. */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {items.map((item) => (
            <Link
              key={item.href}
              href={`/${lang}${item.href}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'relative rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-paper-sunken/60'
              )}
            >
              {item.label}
              {isActive(item.href) && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-t bg-accent" />
              )}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitcher current={lang} label={labels.switchLanguage} className="hidden sm:flex" />

          {user ? (
            <Link
              href={`/${lang}/profile`}
              className="rounded-md transition-opacity hover:opacity-80"
              aria-label={labels.profile}
            >
              {avatar}
            </Link>
          ) : (
            <Link
              href={`/${lang}/auth`}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-accent-hover"
            >
              {labels.signIn}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? labels.closeMenu : labels.openMenu}
            className="rounded-sm p-2 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink md:hidden"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-rule bg-paper-raised md:hidden" aria-label="Main">
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {[
              ...items,
              ...(user
                ? [
                    { href: '/profile', label: labels.profile },
                    { href: '/settings', label: labels.settings },
                  ]
                : [{ href: '/auth', label: labels.signIn }]),
            ].map(
              (item) => (
                <li key={item.href}>
                  <Link
                    href={`/${lang}${item.href}`}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center rounded-sm px-3 py-2.5 text-sm font-medium border-s-2',
                      isActive(item.href)
                        ? 'border-accent bg-paper-sunken text-ink'
                        : 'border-transparent text-ink-muted'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
            <li className="border-t border-rule mt-2 pt-2">
              <LanguageSwitcher current={lang} label={labels.switchLanguage} className="px-2" />
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
