'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Labelled input with an inline error slot. The old build validated nothing and
 * surfaced failures through window.alert(); errors belong next to the field that
 * caused them, wired up with aria-describedby so screen readers announce them.
 *
 * Client-only: useId and useState are hooks. It was already client-only in
 * practice (useId), so the directive states what was true rather than changing it.
 */
export function Field({
  label,
  error,
  hint,
  reveal,
  className,
  id: providedId,
  type,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
  /** Pass labels on a password field to offer a show/hide toggle. */
  reveal?: { show: string; hide: string };
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const [revealed, setRevealed] = useState(false);
  const canReveal = type === 'password' && !!reveal;
  const inputType = canReveal && revealed ? 'text' : type;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn(
            'h-10 w-full rounded-md border bg-paper-raised px-3 text-sm text-ink',
            'placeholder:text-ink-faint',
            'transition-colors duration-150',
            // Logical padding: the toggle sits at the inline end, which is the
            // right in English and the left in Arabic. pe-* follows it for free.
            canReveal && 'pe-11',
            error
              ? 'border-danger focus-visible:outline-danger'
              : 'border-rule hover:border-rule-strong'
          )}
          {...props}
        />

        {canReveal && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            // Not focusable by tab: it sits between the password field and the
            // submit button, and a sighted keyboard user tabbing to submit does
            // not want a detour through a decorative toggle. Still reachable by
            // click, and screen readers announce it via the label.
            tabIndex={-1}
            aria-label={revealed ? reveal.hide : reveal.show}
            aria-pressed={revealed}
            className="absolute end-0 top-0 flex h-10 w-11 items-center justify-center text-ink-faint transition-colors hover:text-ink"
          >
            <EyeIcon closed={revealed} />
          </button>
        )}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Inline rather than an icon package: two paths do not justify a dependency. */
function EyeIcon({ closed }: { closed: boolean }) {
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
      <path d="M1.5 10S4.8 4.5 10 4.5 18.5 10 18.5 10 15.2 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      {closed && <path d="M3 17 17 3" />}
    </svg>
  );
}
