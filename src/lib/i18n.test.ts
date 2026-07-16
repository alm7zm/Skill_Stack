// Run: node --test src/lib/i18n.test.ts
// ponytail: node:test + node:assert, no framework. Covers the one piece of real
// logic in i18n.ts — the Accept-Language parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLocale, pathWithoutLocale, isLocale, dirOf } from './i18n.ts';

test('pickLocale falls back to en when the header is missing or useless', () => {
  assert.equal(pickLocale(null), 'en');
  assert.equal(pickLocale(''), 'en');
  assert.equal(pickLocale('*'), 'en');
  assert.equal(pickLocale('de,fr;q=0.8'), 'en', 'no supported locale -> default');
});

test('pickLocale matches a bare or regional tag', () => {
  assert.equal(pickLocale('ar'), 'ar');
  assert.equal(pickLocale('ar-SA'), 'ar', 'region is ignored');
  assert.equal(pickLocale('en-US,en;q=0.9'), 'en');
});

test('pickLocale honours q-weight order, not header order', () => {
  assert.equal(pickLocale('en;q=0.3,ar;q=0.9'), 'ar');
  assert.equal(pickLocale('ar;q=0.2,en;q=0.8'), 'en');
  // Unweighted entries default to q=1 and should win over explicit lower weights.
  assert.equal(pickLocale('ar,en;q=0.9'), 'ar');
});

test('pickLocale ignores q=0 (explicitly refused) and malformed weights', () => {
  assert.equal(pickLocale('ar;q=0,en;q=0.5'), 'en', 'q=0 means "not acceptable"');
  assert.equal(pickLocale('ar;q=bogus,en;q=0.5'), 'en', 'malformed q is dropped');
});

test('pathWithoutLocale strips the prefix and keeps a leading slash', () => {
  assert.equal(pathWithoutLocale('/ar/dashboard', 'ar'), '/dashboard');
  assert.equal(pathWithoutLocale('/en/plan/abc', 'en'), '/plan/abc');
  assert.equal(pathWithoutLocale('/ar', 'ar'), '/', 'bare locale root');
});

test('isLocale and dirOf', () => {
  assert.ok(isLocale('ar'));
  assert.ok(!isLocale('de'));
  assert.ok(!isLocale(undefined));
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('en'), 'ltr');
});
