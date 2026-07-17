/**
 * Password strength, as guidance rather than a gate.
 *
 * Deliberately NOT enforced beyond MIN_LENGTH. Composition rules ("must contain
 * a symbol") push people towards Passw0rd! — short, predictable, and weak — and
 * NIST SP 800-63B has advised against mandating them since 2017. Length is what
 * actually helps. So the meter shows what would make a password stronger and
 * signup only rejects one that is too short.
 *
 * No dependency: this is five regexes.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordRule = 'length' | 'uppercase' | 'lowercase' | 'number' | 'special';

/** Order is the order the hints render in. */
export const PASSWORD_RULES: PasswordRule[] = [
  'length',
  'uppercase',
  'lowercase',
  'number',
  'special',
];

const TESTS: Record<PasswordRule, (p: string) => boolean> = {
  length: (p) => p.length >= MIN_PASSWORD_LENGTH,
  uppercase: (p) => /[A-Z]/.test(p),
  lowercase: (p) => /[a-z]/.test(p),
  number: (p) => /\d/.test(p),
  // Anything that is not a letter, digit or whitespace. A blocklist of specific
  // punctuation would call £ or é "not a symbol", which is wrong and annoying.
  special: (p) => /[^\p{L}\p{N}\s]/u.test(p),
};

export interface PasswordStrength {
  /** 0-5. Number of rules met. */
  score: number;
  missing: PasswordRule[];
  /** True once the password is long enough to submit. */
  acceptable: boolean;
}

export function passwordStrength(password: string): PasswordStrength {
  const missing = PASSWORD_RULES.filter((rule) => !TESTS[rule](password));
  return {
    score: PASSWORD_RULES.length - missing.length,
    missing,
    acceptable: TESTS.length(password),
  };
}

/** Bucket for the meter's label and colour. Five rules, five buckets. */
export type StrengthLevel = 'veryWeak' | 'weak' | 'fair' | 'good' | 'strong';

export function strengthLevel(score: number): StrengthLevel {
  if (score <= 1) return 'veryWeak';
  if (score === 2) return 'weak';
  if (score === 3) return 'fair';
  if (score === 4) return 'good';
  return 'strong';
}
