'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';

type State = 'idle' | 'syncing' | 'done' | 'needsConnect' | 'error';

/**
 * Pushes a plan's topics into Google Calendar via POST /api/calendar. The whole
 * sync engine already existed server-side; this is the trigger the plan page was
 * missing.
 *
 * `connected` is the server's read of whether a Google refresh token is stored.
 * When it's false we skip the network round-trip and point the user straight at
 * Settings — and we still handle a 428 at click time, because the token can be
 * revoked between page load and the click.
 */
export function SyncCalendarButton({
  lang,
  planId,
  connected,
  alreadySynced,
  labels,
}: {
  lang: Locale;
  planId: string;
  connected: boolean;
  alreadySynced: boolean;
  /** `connect` carries a {settings} placeholder that becomes a link. */
  labels: {
    add: string;
    syncing: string;
    synced: string;
    resync: string;
    connect: string;
    settings: string;
    error: string;
  };
}) {
  const [state, setState] = useState<State>(alreadySynced ? 'done' : 'idle');

  async function sync() {
    if (state === 'syncing') return;
    if (!connected) {
      setState('needsConnect');
      return;
    }
    setState('syncing');
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      // 428 Precondition Required — the route's signal for "not connected" or a
      // token that needs reconnecting. Either way the fix is the same: Settings.
      if (res.status === 428) setState('needsConnect');
      else if (!res.ok) setState('error');
      else setState('done');
    } catch {
      setState('error');
    }
  }

  const label =
    state === 'syncing'
      ? labels.syncing
      : state === 'done'
        ? labels.resync
        : labels.add;

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={sync}
        disabled={state === 'syncing'}
      >
        <CalendarIcon />
        {label}
      </Button>

      {state === 'done' && (
        <span className="ps-1 text-xs text-accent">{labels.synced}</span>
      )}

      {state === 'needsConnect' && (
        <p className="ps-1 text-xs text-ink-muted">
          {labels.connect.split('{settings}').map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <Link
                  href={`/${lang}/settings`}
                  className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  {labels.settings}
                </Link>
              )}
            </span>
          ))}
        </p>
      )}

      {state === 'error' && (
        <p role="alert" className="ps-1 text-xs text-danger">
          {labels.error}
        </p>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8h14M7 3v3M13 3v3" />
    </svg>
  );
}
