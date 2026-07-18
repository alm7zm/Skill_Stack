import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertCurrency } from './rates.ts';

test('convertCurrency: same currency is identity', () => {
  assert.equal(convertCurrency(100, 'USD', 'USD'), 100);
  assert.equal(convertCurrency(250, 'SAR', 'SAR'), 250);
});

test('convertCurrency: USD to another currency multiplies by its rate', () => {
  assert.equal(convertCurrency(100, 'USD', 'SAR'), 375);
});

test('convertCurrency: a cross rate goes via USD', () => {
  // 100 EUR -> USD (/0.92) -> GBP (*0.79)
  assert.ok(Math.abs(convertCurrency(100, 'EUR', 'GBP')! - (100 / 0.92) * 0.79) < 1e-9);
});

test('convertCurrency: an unknown currency on either side returns null', () => {
  assert.equal(convertCurrency(100, 'USD', 'XYZ'), null);
  assert.equal(convertCurrency(100, 'ZZZ', 'USD'), null);
});
