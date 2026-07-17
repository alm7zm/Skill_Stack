import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf } from './resource-prefs.ts';

test('known hosts map to their site label', () => {
  assert.equal(siteOf('https://www.youtube.com/watch?v=abc'), 'YouTube');
  assert.equal(siteOf('https://youtu.be/abc'), 'YouTube');
  assert.equal(siteOf('https://www.udemy.com/course/x'), 'Udemy');
  assert.equal(siteOf('https://learn.udemy.com/x'), 'Udemy'); // subdomain
});

test('unknown platforms are null, not a wrong guess', () => {
  assert.equal(siteOf('https://aws.amazon.com/certification/'), null);
  assert.equal(siteOf('not a url'), null);
});

test('the host is matched, not a substring of the whole url', () => {
  // A spammer parking youtube.com in a query string is not YouTube.
  assert.equal(siteOf('https://evil.example.com/?ref=youtube.com'), null);
});
