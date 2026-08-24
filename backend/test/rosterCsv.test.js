const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRosterCsv } = require('../lib/rosterCsv');

test('missing Name column fails the whole import', () => {
  const result = parseRosterCsv([{ Grade: '9' }]);
  assert.equal(result.athletes.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Missing required column\(s\): Name/);
});

test('missing both Grade and Graduation Year columns fails the whole import', () => {
  const result = parseRosterCsv([{ Name: 'Jane Doe' }]);
  assert.equal(result.athletes.length, 0);
  assert.match(result.errors[0].message, /Grade' or 'Graduation Year/);
});

test('a valid row with Grade parses correctly', () => {
  const result = parseRosterCsv([{ Name: 'Jane Doe', Grade: '9', Gender: 'F' }]);
  assert.equal(result.athletes.length, 1);
  assert.deepEqual(result.athletes[0], { name: 'Jane Doe', grade: 9, graduationYear: null, genderRaw: 'F' });
  assert.equal(result.errors.length, 0);
});

test('a valid row with Graduation Year instead of Grade parses correctly', () => {
  const result = parseRosterCsv([{ Name: 'Jane Doe', 'Graduation Year': '2029' }]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.athletes[0].graduationYear, 2029);
  assert.equal(result.athletes[0].grade, null);
});

test('a blank Name row is silently skipped, not an error', () => {
  const result = parseRosterCsv([{ Name: '', Grade: '9' }, { Name: 'Jane Doe', Grade: '9' }]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.skipped, 1);
});

test('a grade out of 9-12 range is a per-row error, not fatal to the rest of the file', () => {
  const result = parseRosterCsv([
    { Name: 'Bad Grade', Grade: '13' },
    { Name: 'Jane Doe', Grade: '9' },
  ]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.athletes[0].name, 'Jane Doe');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /out of range/);
});

test('a row with neither Grade nor Graduation Year usable is a per-row error, not fatal', () => {
  const result = parseRosterCsv([
    { Name: 'No Grade', Grade: '' },
    { Name: 'Jane Doe', Grade: '9' },
  ]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /no valid Grade/);
});
