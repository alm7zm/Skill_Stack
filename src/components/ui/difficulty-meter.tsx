import { cn, difficultyLevel } from '@/lib/utils';
import type { Difficulty } from '@/lib/types';

/**
 * Replaces the old per-level colour map (emerald/amber/orange/red), which added
 * four accents to a one-accent system and encoded an ordinal scale in hue alone
 * — unreadable for anyone with a colour vision deficiency.
 *
 * Four rising bars carry the same information by *shape*, and the label is
 * always rendered alongside, so the meter is decorative rather than load-bearing.
 */
export function DifficultyMeter({
  difficulty,
  label,
  className,
}: {
  difficulty: Difficulty;
  label: string;
  className?: string;
}) {
  const level = difficultyLevel(difficulty);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'w-[3px] rounded-xs transition-colors',
              step <= level ? 'bg-accent' : 'bg-rule-strong'
            )}
            style={{ height: `${3 + step * 2}px` }}
          />
        ))}
      </span>
      <span className="text-xs text-ink-muted">{label}</span>
    </span>
  );
}
