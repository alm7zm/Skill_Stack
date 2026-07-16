import { cn } from '@/lib/utils';
import { ButtonLink } from './button';

/**
 * The old build had no empty states — an account with no plans rendered a blank
 * panel. A composed "here is what to do next" view is the difference between
 * looking broken and looking finished.
 */
export function EmptyState({
  title,
  body,
  cta,
  className,
}: {
  title: string;
  body: string;
  cta?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-rule-strong',
        'bg-paper-sunken/50 px-6 py-14 text-center',
        className
      )}
    >
      {/* Stack-of-books glyph, echoing the logo. Decorative. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="mb-4 h-8 w-8 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      >
        <rect x="6" y="21" width="20" height="5" rx="1" />
        <rect x="8" y="15" width="16" height="5" rx="1" />
        <rect x="10" y="9" width="12" height="5" rx="1" />
      </svg>

      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p className="prose-measure mt-1.5 text-sm text-ink-muted">{body}</p>

      {cta && (
        <ButtonLink href={cta.href} variant="secondary" size="sm" className="mt-5">
          {cta.label}
        </ButtonLink>
      )}
    </div>
  );
}
