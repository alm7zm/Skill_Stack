import { cn } from '@/lib/utils';

/**
 * Square, not pill — pill badges are the default AI look. Small-caps with
 * positive tracking reads as a label rather than a button you can press.
 */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'quiet';
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'bg-paper-sunken text-ink-muted border-rule',
    accent: 'bg-accent-wash text-accent border-accent/25',
    quiet: 'bg-transparent text-ink-faint border-transparent ps-0',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border px-1.5 py-0.5',
        'text-[0.6875rem] font-medium uppercase tracking-[0.08em]',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
