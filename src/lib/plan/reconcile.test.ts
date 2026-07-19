// Run: node --test src/lib/plan/reconcile.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeeks, collectTopicIds, planTopicDiff, matchTopicIds } from './reconcile.ts';
import type { EditableWeek, EditablePlan } from './types.ts';

const week = (over: Partial<EditableWeek>): EditableWeek => ({
  weekNumber: 1,
  title: 'W',
  estimatedHours: 1,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics: [],
  ...over,
});

test('normalizeWeeks renumbers to sequential 1..N in array order', () => {
  const out = normalizeWeeks([week({ weekNumber: 9 }), week({ weekNumber: 3 }), week({ weekNumber: 40 })]);
  assert.deepEqual(out.map((w) => w.weekNumber), [1, 2, 3]);
});

test('collectTopicIds returns every id in order', () => {
  const plan: EditablePlan = {
    weeks: [
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
      week({ topics: [{ id: 'b', title: 't', description: '', estimatedHours: 1 }] }),
    ],
  };
  assert.deepEqual(collectTopicIds(plan), ['a', 'b']);
});

test('collectTopicIds throws on a duplicate id', () => {
  const plan: EditablePlan = {
    weeks: [
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
    ],
  };
  assert.throws(() => collectTopicIds(plan), /duplicate topic id/);
});

test('planTopicDiff: added insert, removed delete, survivors kept', () => {
  const d = planTopicDiff(['a', 'b', 'c'], ['b', 'c', 'x']);
  assert.deepEqual(d.toInsert, ['x']);
  assert.deepEqual(d.toDelete.sort(), ['a']);
  assert.deepEqual(d.survivors.sort(), ['b', 'c']);
});

test('planTopicDiff: a new plan (empty current) inserts everything', () => {
  const d = planTopicDiff([], ['a', 'b']);
  assert.deepEqual(d.toInsert, ['a', 'b']);
  assert.deepEqual(d.toDelete, []);
});

const oneTopicPlan = (id: string, title: string, description = ''): EditablePlan => ({
  weeks: [week({ topics: [{ id, title, description, estimatedHours: 1 }] })],
});

test('matchTopicIds reuses the original id for an unchanged (renamed-case) topic', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised = oneTopicPlan('model-made-this-up', '  iam   basics ');
  const out = matchTopicIds(original, revised);
  assert.equal(out.weeks[0].topics[0].id, 'orig-1');
});

test('matchTopicIds mints a fresh id for a genuinely new topic', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised = oneTopicPlan('anything', 'Brand new topic');
  const out = matchTopicIds(original, revised);
  assert.notEqual(out.weeks[0].topics[0].id, 'orig-1');
  assert.match(out.weeks[0].topics[0].id, /[0-9a-f-]{36}/);
});

test('matchTopicIds never reuses one original id twice', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised: EditablePlan = {
    weeks: [
      week({
        topics: [
          { id: 'x', title: 'IAM basics', description: '', estimatedHours: 1 },
          { id: 'y', title: 'IAM basics', description: '', estimatedHours: 1 },
        ],
      }),
    ],
  };
  const out = matchTopicIds(original, revised);
  const [a, b] = out.weeks[0].topics.map((t) => t.id);
  assert.equal(a, 'orig-1');
  assert.notEqual(b, 'orig-1');
});

test('matchTopicIds disambiguates repeated titles by description', () => {
  const original: EditablePlan = {
    weeks: [
      week({
        topics: [
          { id: 'iam-a', title: 'IAM', description: 'roles', estimatedHours: 1 },
          { id: 'iam-b', title: 'IAM', description: 'policies', estimatedHours: 1 },
        ],
      }),
    ],
  };
  const revised: EditablePlan = {
    weeks: [
      week({
        topics: [{ id: 'z', title: 'IAM', description: 'policies', estimatedHours: 1 }],
      }),
    ],
  };
  const out = matchTopicIds(original, revised);
  assert.equal(out.weeks[0].topics[0].id, 'iam-b');
});
