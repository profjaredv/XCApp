const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGender } = require('../lib/gender');

test('normalizeGender: exact M/F pass through', () => {
  assert.equal(normalizeGender('M'), 'M');
  assert.equal(normalizeGender('F'), 'F');
});

test('normalizeGender: known variants map to M/F', () => {
  assert.equal(normalizeGender('Men'), 'M');
  assert.equal(normalizeGender('Male'), 'M');
  assert.equal(normalizeGender('Boys'), 'M');
  assert.equal(normalizeGender('boy'), 'M');
  assert.equal(normalizeGender('Women'), 'F');
  assert.equal(normalizeGender('Female'), 'F');
  assert.equal(normalizeGender('Girls'), 'F');
  assert.equal(normalizeGender('girl'), 'F');
});

test('normalizeGender: case/whitespace insensitive', () => {
  assert.equal(normalizeGender('  men  '), 'M');
  assert.equal(normalizeGender('WOMEN'), 'F');
});

test('normalizeGender: unrecognized or missing values return null, never guess', () => {
  assert.equal(normalizeGender(null), null);
  assert.equal(normalizeGender(undefined), null);
  assert.equal(normalizeGender(''), null);
  assert.equal(normalizeGender('Non-binary'), null);
  assert.equal(normalizeGender('Unknown'), null);
});
