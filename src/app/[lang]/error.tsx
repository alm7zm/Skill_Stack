'use client';

import { useEffect } from 'react';

/**
 * Error boundaries must be client components — this is the one place "use client"
 * is not a design choice.
 *
 * The old build had no error boundary anywhere, so a throw in any server
 * component showed the Next.js error overlay in dev and a blank page in prod.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire to a real reporter when one exists. Until then this at least surfaces
    // the digest, which is the only handle you get on a prod server error.
    console.error('Route error:', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Something broke</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We couldn&rsquo;t load this. Trying again usually works.
        </p>

        {error.digest && (
          <p className="tabular mt-3 text-xs text-ink-faint">Reference: {error.digest}</p>
        )}

        <button
          onClick={reset}
          className="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
