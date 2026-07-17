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
  icon,
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
  /** Decorative glyph at the inline start. Purely a visual anchor — the <label>
   *  is what names the field, so this stays aria-hidden. */
  icon?: React.ReactNode;
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
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-0 flex h-10 items-center text-ink-faint"
          >
            {icon}
          </span>
        )}

        <input
          id={id}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn(
            'h-10 w-full rounded-md border bg-paper-raised px-3 text-sm text-ink',
            'placeholder:text-ink-faint',
            'transition-colors duration-150',
            // Logical padding: the icon sits at the inline start and the toggle at
            // the inline end — right in English, left in Arabic. ps-/pe-* follow
            // them for free.
            icon && 'ps-10',
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
        <p id={errorId} role="alert" className="flex items-center gap-1 text-xs text-danger">
          <AlertIcon />
          {error}
        </p>
      )}
    </div>
  );
}

/** aria-hidden: the message beside it already says everything this conveys. */
function AlertIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2.5 1.5 13.5h13L8 2.5Z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.75v.25" />
    </svg>
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
