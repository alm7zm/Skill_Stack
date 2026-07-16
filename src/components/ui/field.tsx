import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Labelled input with an inline error slot. The old build validated nothing and
 * surfaced failures through window.alert(); errors belong next to the field that
 * caused them, wired up with aria-describedby so screen readers announce them.
 */
export function Field({
  label,
  error,
  hint,
  className,
  id: providedId,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          'h-10 rounded-md border bg-paper-raised px-3 text-sm text-ink',
          'placeholder:text-ink-faint',
          'transition-colors duration-150',
          error
            ? 'border-danger focus-visible:outline-danger'
            : 'border-rule hover:border-rule-strong'
        )}
        {...props}
      />

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
