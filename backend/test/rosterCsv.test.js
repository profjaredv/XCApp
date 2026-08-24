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
  assert.deepEqual(result.athletes[0], { name: 'Jane Doe', grade: 9, graduationYear: null, genderRaw: 'F', preferredName: null });
  assert.equal(result.errors.length, 0);
});

test('a Preferred Name or Nickname column is captured, either header works', () => {
  const byPreferredName = parseRosterCsv([{ Name: 'Jane Doe', Grade: '9', 'Preferred Name': 'Janie' }]);
  assert.equal(byPreferredName.athletes[0].preferredName, 'Janie');

  const byNickname = parseRosterCsv([{ Name: 'Jane Doe', Grade: '9', Nickname: 'Janie' }]);
  assert.equal(byNickname.athletes[0].preferredName, 'Janie');

  const blank = parseRosterCsv([{ Name: 'Jane Doe', Grade: '9', 'Preferred Name': '  ' }]);
  assert.equal(blank.athletes[0].preferredName, null);
});

test('First Name / Last Name columns combine into the full name when there is no Name column', () => {
  const result = parseRosterCsv([{ 'First Name': 'Jane', 'Last Name': 'Doe', Grade: '9' }]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.athletes[0].name, 'Jane Doe');
});

test('Preferred First Name is paired with Last Name so the surname survives', () => {
  const result = parseRosterCsv([
    { 'First Name': 'Alexandria', 'Preferred First Name': 'Alex', 'Last Name': 'Doe', Grade: '9', Gender: 'F' },
  ]);
  assert.equal(result.athletes.length, 1);
  assert.equal(result.athletes[0].name, 'Alexandria Doe');
  assert.equal(result.athletes[0].preferredName, 'Alex Doe');
});

test('a blank Preferred First Name is treated as no nickname, not "undefined Doe"', () => {
  const result = parseRosterCsv([{ 'First Name': 'Jane', 'Last Name': 'Doe', Grade: '9' }]);
  assert.equal(result.athletes[0].preferredName, null);
});

test('an explicit Preferred Name column wins over Preferred First Name when both are present', () => {
  const result = parseRosterCsv([
    { Name: 'Jane Doe', Grade: '9', 'Preferred Name': 'Janie D', 'Preferred First Name': 'Jane-ish' },
  ]);
  assert.equal(result.athletes[0].preferredName, 'Janie D');
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
