import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownFacts, planPrompt, resourcesForBudget, systemPrompt } from './advisor.ts';
import type { LearningResource } from '@/lib/types';

const resources = [
  { id: 'free-1', certificationId: 'x', title: 'Docs', provider: 'P', url: 'https://a', duration: '1h', free: true, type: 'documentation' },
  { id: 'paid-1', certificationId: 'x', title: 'Course', provider: 'Q', url: 'https://b', duration: '2h', free: false, type: 'course' },
] satisfies LearningResource[];

test('budget 0 hides paid resources from the model entirely', () => {
  const offered = resourcesForBudget(resources, 0);
  assert.deepEqual(
    offered.map((r) => r.id),
    ['free-1']
  );
});

test('an unset budget is not a free-only budget', () => {
  // null means "we never asked", which must not silently become a constraint.
  assert.equal(resourcesForBudget(resources, null).length, 2);
  assert.equal(resourcesForBudget(resources, undefined).length, 2);
});

test('a real budget offers both, and the UI labels which is which', () => {
  assert.equal(resourcesForBudget(resources, 50).length, 2);
});

test('knownFacts keeps a zero budget — it is the fact that matters most', () => {
  const facts = knownFacts({ budget: 0 });
  assert.equal(facts.length, 1);
  assert.match(facts[0].value, /only use free/);
});

test('knownFacts omits fields the user never filled in', () => {
  assert.deepEqual(knownFacts({ career_goal: null, job_role: '', budget: undefined }), []);
  assert.deepEqual(knownFacts(null), []);
});

test('knownFacts reports what the profile holds', () => {
  const facts = knownFacts({ experience_level: 'beginner', daily_study_time: 2 });
  assert.deepEqual(
    facts.map((f) => f.value),
    ['beginner', '2']
  );
});

test('knownFacts carries skills and languages — they used to go nowhere', () => {
  const facts = knownFacts(null, ['Linux', 'Python'], ['Arabic', 'English']);
  assert.deepEqual(facts, [
    { label: 'Skills they already have', value: 'Linux, Python' },
    { label: 'Languages they can sit an exam in', value: 'Arabic, English' },
  ]);
});

test('knownFacts omits empty skill and language lists', () => {
  assert.deepEqual(knownFacts(null, [], []), []);
});

test('a profile with only skills still produces facts', () => {
  // The early return keys off all three being empty, not off profile alone —
  // a user who filled in nothing but skills must not be reported as unknown.
  assert.equal(knownFacts(null, ['Docker'], []).length, 1);
});

test('the known block tells the model not to re-ask, and to check exam language', () => {
  const prompt = systemPrompt(undefined, 'en', [], knownFacts({ experience_level: 'beginner' }));
  assert.match(prompt, /Do not ask about anything on that list/);
  assert.match(prompt, /already told SkillStack/);
});

test('an empty profile produces no known block at all', () => {
  const prompt = systemPrompt(undefined, 'en', [], []);
  assert.doesNotMatch(prompt, /Do not ask about anything on that list/);
});

test('the plan prompt lists candidate ids with their site and never asks for URLs', () => {
  const prompt = planPrompt(undefined, 'en', resources);
  assert.match(prompt, /free-1 \| Docs \| P \| other \| documentation \| free/);
  assert.match(prompt, /paid-1 \| Course \| Q \| other \| course \| paid/);
  assert.match(prompt, /Never write a URL/);
});

test('a known site shows through so a platform preference can be honoured', () => {
  const yt = [
    { id: 'v1', certificationId: 'x', title: 'T', provider: 'P', url: 'https://youtu.be/abc', duration: '10m', free: true, type: 'video' },
  ] satisfies LearningResource[];
  assert.match(planPrompt(undefined, 'en', yt), /v1 \| T \| P \| YouTube \| video \| free/);
});

test('preferences appear as tie-breakers, and only when set', () => {
  const withPref = planPrompt(undefined, 'en', resources, { formats: ['video'], sites: ['YouTube'] });
  assert.match(withPref, /Preferred formats: video/);
  assert.match(withPref, /Preferred platforms: YouTube/);
  assert.match(withPref, /tie-breakers, not filters/);
  // No preference block at all when the learner stated none.
  assert.doesNotMatch(planPrompt(undefined, 'en', resources, {}), /tie-breakers/);
});

test('knownFacts reports preferred formats and sites when present', () => {
  const facts = knownFacts({
    preferred_resource_formats: ['video', 'course'],
    preferred_resource_sites: ['YouTube'],
  });
  assert.deepEqual(facts, [
    { label: 'Study formats they prefer', value: 'video, course' },
    { label: 'Learning platforms they prefer', value: 'YouTube' },
  ]);
});

test('with no curated resources the model is told to leave weeks empty', () => {
  const prompt = planPrompt(undefined, 'en', []);
  assert.match(prompt, /no curated resources/);
});
