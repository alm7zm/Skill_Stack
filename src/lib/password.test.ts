import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength, strengthLevel, MIN_PASSWORD_LENGTH } from './password.ts';

test('empty password meets nothing', () => {
  const s = passwordStrength('');
  assert.equal(s.score, 0);
  assert.equal(s.acceptable, false);
  assert.deepEqual(s.missing, ['length', 'uppercase', 'lowercase', 'number', 'special']);
});

test('a password meeting every rule scores 5', () => {
  const s = passwordStrength('Correct1!horse');
  assert.equal(s.score, 5);
  assert.deepEqual(s.missing, []);
  assert.equal(s.acceptable, true);
});

test('length is the only thing that gates submission', () => {
  // Long but boring: weak on the meter, still allowed. This is the NIST point —
  // a long passphrase beats a short password with a symbol bolted on.
  const passphrase = passwordStrength('correcthorsebatterystaple');
  assert.equal(passphrase.acceptable, true);
  assert.ok(passphrase.score < 5);

  // Short but complex: scores well, still rejected.
  const short = passwordStrength('Ab1!');
  assert.equal(short.acceptable, false);
  assert.ok(short.missing.includes('length'));
});

test('exactly MIN_PASSWORD_LENGTH is acceptable (boundary)', () => {
  assert.equal(passwordStrength('a'.repeat(MIN_PASSWORD_LENGTH - 1)).acceptable, false);
  assert.equal(passwordStrength('a'.repeat(MIN_PASSWORD_LENGTH)).acceptable, true);
});

test('each rule is detected independently', () => {
  assert.ok(!passwordStrength('lowercase1!').missing.includes('lowercase'));
  assert.ok(passwordStrength('lowercase1!').missing.includes('uppercase'));
  assert.ok(passwordStrength('UPPERCASE1!').missing.includes('lowercase'));
  assert.ok(passwordStrength('NoDigits!!').missing.includes('number'));
  assert.ok(passwordStrength('NoSymbols1').missing.includes('special'));
});

test('non-ASCII letters are letters, not symbols', () => {
  // A blocklist of ASCII punctuation would miscount é as a symbol and hand out
  // a free point for typing a French name.
  assert.ok(passwordStrength('éééééééé').missing.includes('special'));
  assert.ok(passwordStrength('كلمةالسر').missing.includes('special'));
  // ...but a real symbol still counts, including a non-ASCII one.
  assert.ok(!passwordStrength('password£1').missing.includes('special'));
});

test('whitespace is not a symbol', () => {
  assert.ok(passwordStrength('two words').missing.includes('special'));
});

test('strengthLevel buckets every score', () => {
  assert.equal(strengthLevel(0), 'veryWeak');
  assert.equal(strengthLevel(1), 'veryWeak');
  assert.equal(strengthLevel(2), 'weak');
  assert.equal(strengthLevel(3), 'fair');
  assert.equal(strengthLevel(4), 'good');
  assert.equal(strengthLevel(5), 'strong');
});
