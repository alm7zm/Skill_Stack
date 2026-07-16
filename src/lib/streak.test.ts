// Run: node --test src/lib/streak.test.ts
// Covers computeStreak, which replaced a hardcoded `useCounter(12)`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak } from './streak.ts';

const DAY = 86_400_000;
/** ISO timestamp N days before now, at a fixed hour to avoid midnight flapping. */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

test('no activity is no streak', () => {
  assert.equal(computeStreak([]), 0);
  assert.equal(computeStreak([null, null]), 0);
});

test('studying today starts a streak of 1', () => {
  assert.equal(computeStreak([daysAgo(0)]), 1);
});

test('consecutive days accumulate', () => {
  assert.equal(computeStreak([daysAgo(0), daysAgo(1), daysAgo(2)]), 3);
});

test('several topics on the same day still count as one day', () => {
  assert.equal(computeStreak([daysAgo(0), daysAgo(0), daysAgo(0)]), 1);
});

test('a gap ends the streak at the gap', () => {
  // today, yesterday, then nothing on day 2, then day 3
  assert.equal(computeStreak([daysAgo(0), daysAgo(1), daysAgo(3)]), 2);
});

test('yesterday still counts — a streak is not broken before today is over', () => {
  assert.equal(computeStreak([daysAgo(1), daysAgo(2)]), 2);
});

test('activity older than yesterday is a broken streak', () => {
  assert.equal(computeStreak([daysAgo(2), daysAgo(3), daysAgo(4)]), 0);
});

test('unordered input is handled', () => {
  assert.equal(computeStreak([daysAgo(2), daysAgo(0), daysAgo(1)]), 3);
});

test('nulls mixed with real timestamps are ignored', () => {
  assert.equal(computeStreak([null, daysAgo(0), null, daysAgo(1)]), 2);
});
