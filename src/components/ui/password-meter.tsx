'use client';

import { passwordStrength, strengthLevel, type PasswordRule, type StrengthLevel } from '@/lib/password';
import { cn } from '@/lib/utils';

/**
 * Shows what would make a password stronger. It does not block anything — see
 * lib/password.ts for why composition rules are guidance here, not a gate.
 *
 * One accent, per the design system: strength reads from how full the bar is,
 * not from a red/amber/green scale. That also keeps it legible to the ~8% of men
 * with red-green colour blindness, who a three-colour meter tells nothing.
 */

const WIDTH: Record<StrengthLevel, string> = {
  veryWeak: 'w-1/5',
  weak: 'w-2/5',
  fair: 'w-3/5',
  good: 'w-4/5',
  strong: 'w-full',
};

export function PasswordMeter({
  password,
  labels,
}: {
  password: string;
  labels: {
    strength: string;
    levels: Record<StrengthLevel, string>;
    rules: Record<PasswordRule, string>;
  };
}) {
  if (!password) return null;

  const { score, missing } = passwordStrength(password);
  const level = strengthLevel(score);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-paper-sunken"
          role="meter"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-label={labels.strength}
          aria-valuetext={labels.levels[level]}
        >
          <div
            className={cn(
              'h-full rounded-full bg-accent transition-[width] duration-200',
              WIDTH[level]
            )}
          />
        </div>
        {/* aria-hidden: the meter already announces this via aria-valuetext, and
            without it a screen reader reads the level twice. */}
        <span className="min-w-16 text-xs text-ink-faint" aria-hidden="true">
          {labels.levels[level]}
        </span>
      </div>

      {missing.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
          {missing.map((rule) => (
            <li key={rule} className="text-xs text-ink-faint">
              {labels.rules[rule]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
