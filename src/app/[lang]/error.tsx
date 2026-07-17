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
    // Log the Error object, not a string built from it.
    //
    // This used to pass `error.digest ?? error.message`. Handing console.error a
    // string makes the browser attach *this call site's* stack — forty frames of
    // React internals ending at this line — and throw away the error's own stack,
    // which is the only part that says what broke. Passing the object keeps the
    // real stack, and digest/message are still on it.
    //
    // Wire to a real reporter when one exists; digest is the only handle you get
    // on a prod server error, where message is redacted.
    console.error('Route error:', error);
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
