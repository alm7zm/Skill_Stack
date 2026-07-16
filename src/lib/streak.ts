/**
 * Pure, dependency-free so it can be unit-tested with `node --test` (Node cannot
 * resolve the `@/` bundler alias, so anything importing Supabase is untestable
 * without a harness — and this logic deserves a test more than the query wrapper does).
 */

const DAY_MS = 86_400_000;

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Consecutive days ending today (or yesterday) with at least one completed topic.
 * Replaces the old dashboard's hardcoded `useCounter(12)`.
 *
 * Yesterday counts as an anchor on purpose: a streak should not read as broken
 * at 00:01 before the user has had a chance to study today.
 *
 * ponytail: UTC day keys, matching completed_at. Someone studying at 11pm in
 * UTC+3 lands on the next UTC day, which can merge or split a day at the edges.
 * Fix by storing a timezone on profiles and bucketing in local time — not worth
 * it until profiles carry one.
 */
export function computeStreak(completedAt: (string | null)[]): number {
  const days = new Set(
    completedAt
      .filter((d): d is string => Boolean(d))
      .map((d) => dayKey(Date.parse(d)))
  );
  if (days.size === 0) return 0;

  const now = Date.now();
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY_MS);

  let cursor: number;
  if (days.has(today)) cursor = Date.parse(`${today}T00:00:00Z`);
  else if (days.has(yesterday)) cursor = Date.parse(`${yesterday}T00:00:00Z`);
  else return 0; // newest activity predates yesterday — the streak is broken

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}
