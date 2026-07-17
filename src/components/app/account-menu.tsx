'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Locale } from '@/lib/i18n';

/**
 * The account menu behind the avatar: who you are, where to go, and the way out.
 *
 * Sign out used to live only on /settings — and /settings was only linked from
 * the mobile menu, so on a desktop the only way to sign out was to type the URL.
 * Signing out is not a setting; it belongs wherever your face is, on every page.
 *
 * ponytail: hand-rolled rather than popover="auto". Popover gives light-dismiss,
 * Escape and the top layer for free, but positioning it against the avatar needs
 * CSS anchor positioning, which Firefox does not ship — so it would be the
 * native API plus a fallback, which is more code than the twenty lines below.
 * Revisit when anchor positioning is baseline.
 */
export function AccountMenu({
  lang,
  name,
  email,
  avatar,
  labels,
}: {
  lang: Locale;
  name: string | null;
  email: string;
  avatar: React.ReactNode;
  labels: {
    account: string;
    profile: string;
    settings: string;
    signOut: string;
    signingOut: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    // scope: 'local' — the default is 'global', which revokes every refresh
    // token the account has. Signing out of a laptop should not sign you out of
    // your phone; that is a "sign out everywhere" button, and this is not it.
    await createClient().auth.signOut({ scope: 'local' });
    router.push(`/${lang}`);
    router.refresh(); // drop the server-rendered signed-in shell
  }

  return (
    <div ref={root} className="relative">
      {/* Deliberately not role="menu"/"menuitem". That role is an application
          menu and promises arrow-key navigation with a roving tabindex; a
          screen reader announces it as one and then Tab does not work the way
          it just said it would. This is a group of links and a button, so
          plain markup is both the honest description and the smaller one —
          Tab and Enter already do the right thing. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={labels.account}
        className="flex items-center gap-1 rounded-md p-0.5 transition-opacity hover:opacity-80"
      >
        {avatar}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`h-3 w-3 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {open && (
        // end-0: opens toward the inside of the page, and flips for Arabic on its own.
        <div
          id="account-menu"
          className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-rule bg-paper-raised shadow-lg"
        >
          <div className="border-b border-rule px-3 py-3">
            {/* truncate: a long Google display name or address must not widen the
                menu off the edge of the viewport. */}
            {name && <p className="truncate text-sm font-medium text-ink">{name}</p>}
            <p className="truncate text-xs text-ink-muted" title={email}>
              {email}
            </p>
          </div>

          <div className="p-1">
            <MenuLink href={`/${lang}/profile`} onClick={() => setOpen(false)}>
              {labels.profile}
            </MenuLink>
            <MenuLink href={`/${lang}/settings`} onClick={() => setOpen(false)}>
              {labels.settings}
            </MenuLink>
          </div>

          <div className="border-t border-rule p-1">
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="w-full rounded-sm px-2.5 py-2 text-start text-sm font-medium text-danger transition-colors hover:bg-danger-wash disabled:opacity-60"
            >
              {busy ? labels.signingOut : labels.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-sm px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
    >
      {children}
    </Link>
  );
}
