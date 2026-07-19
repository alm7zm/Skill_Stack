// Run: node --test src/lib/plan/schema.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savePlanSchema } from './schema.ts';

const topic = (id: string) => ({ id, title: 'T', description: 'd', estimatedHours: 2 });
const week = (topics: ReturnType<typeof topic>[]) => ({
  weekNumber: 1,
  title: 'Week',
  estimatedHours: 4,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics,
});
const base = (over = {}) => ({ certId: 'aws-saa', weeks: [week([topic('a')])], ...over });

test('a minimal valid plan parses', () => {
  assert.equal(savePlanSchema.safeParse(base()).success, true);
});

test('rejects a plan with no topics at all', () => {
  assert.equal(savePlanSchema.safeParse(base({ weeks: [week([])] })).success, false);
});

test('rejects duplicate topic ids across weeks', () => {
  const bad = base({ weeks: [week([topic('a')]), week([topic('a')])] });
  assert.equal(savePlanSchema.safeParse(bad).success, false);
});

test('rejects negative estimatedHours', () => {
  const bad = base({ weeks: [week([{ ...topic('a'), estimatedHours: -1 }])] });
  assert.equal(savePlanSchema.safeParse(bad).success, false);
});

test('rejects more than 104 weeks', () => {
  const many = Array.from({ length: 105 }, (_, i) => week([topic(`t${i}`)]));
  assert.equal(savePlanSchema.safeParse(base({ weeks: many })).success, false);
});

test('rejects an empty topic id', () => {
  assert.equal(savePlanSchema.safeParse(base({ weeks: [week([topic('')])] })).success, false);
});

test('accepts an optional YYYY-MM-DD target date and rejects garbage', () => {
  assert.equal(savePlanSchema.safeParse(base({ targetDate: '2026-09-01' })).success, true);
  assert.equal(savePlanSchema.safeParse(base({ targetDate: 'soon' })).success, false);
});
