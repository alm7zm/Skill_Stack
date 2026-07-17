import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_MS, isIdle } from './idle.ts';

const now = 1_700_000_000_000;

test('a missing cookie is not idle — it is the first request', () => {
  assert.equal(isIdle(undefined, now), false);
});

test('garbage is not idle — it must not lock anyone out', () => {
  assert.equal(isIdle('not-a-number', now), false);
  assert.equal(isIdle('', now), false);
});

test('fresh activity is not idle', () => {
  assert.equal(isIdle(String(now - 1000), now), false);
});

test('exactly at the limit is not yet idle', () => {
  assert.equal(isIdle(String(now - IDLE_MS), now), false);
});

test('past the limit is idle', () => {
  assert.equal(isIdle(String(now - IDLE_MS - 1), now), true);
});

test('a clock that jumped backwards does not sign anyone out', () => {
  assert.equal(isIdle(String(now + 60_000), now), false);
});
