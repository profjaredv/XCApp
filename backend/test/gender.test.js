const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGender, genderFromDivisionLabel, resolveFieldResultGender } = require('../lib/gender');

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

// --- genderFromDivisionLabel / resolveFieldResultGender ---
//
// A confirmed real case (Ellensburg, 9/25/26): a meet's results/all page
// rendered with no separate Mens/Womens Results header at all, so the
// field-results bookmarklet's OLD extraction left FieldResult.gender
// blank for all 552 finishers — silently dropping every division from
// team scoring and Top 20%-of-field, even with correct name-matching.
// The division text ("Boys Varsity", "Girls JV") routinely spells gender
// out on its own; these are the fallback that reads it from there.

test('genderFromDivisionLabel: reads gender out of a division label that spells it out', () => {
  assert.equal(genderFromDivisionLabel('Boys Varsity'), 'M');
  assert.equal(genderFromDivisionLabel('Girls JV'), 'F');
  assert.equal(genderFromDivisionLabel('Boys Gold Varsity'), 'M');
});

test('genderFromDivisionLabel: checks women/girl before men/boy — "Women" contains "men"', () => {
  assert.equal(genderFromDivisionLabel('Womens Varsity'), 'F');
  assert.equal(genderFromDivisionLabel('Girls Varsity'), 'F');
});

test('genderFromDivisionLabel: case-insensitive', () => {
  assert.equal(genderFromDivisionLabel('BOYS VARSITY'), 'M');
});

test('genderFromDivisionLabel: null/blank or a label with no gender word returns null, not a guess', () => {
  assert.equal(genderFromDivisionLabel(null), null);
  assert.equal(genderFromDivisionLabel(''), null);
  assert.equal(genderFromDivisionLabel('Varsity'), null);
});

test('resolveFieldResultGender: the gender column wins when it resolves to something', () => {
  assert.equal(resolveFieldResultGender({ gender: 'Boys', division: 'Girls Varsity' }), 'M');
});

test('resolveFieldResultGender: falls back to the division label when the gender column is blank', () => {
  // The actual bug: gender column empty, but the division text still
  // says exactly who ran it.
  assert.equal(resolveFieldResultGender({ gender: '', division: 'Boys Varsity' }), 'M');
  assert.equal(resolveFieldResultGender({ gender: null, division: 'Girls JV' }), 'F');
});

test('resolveFieldResultGender: null when neither the column nor the division give an answer', () => {
  assert.equal(resolveFieldResultGender({ gender: '', division: 'Varsity' }), null);
  assert.equal(resolveFieldResultGender({ gender: null, division: null }), null);
  assert.equal(resolveFieldResultGender({}), null);
});
