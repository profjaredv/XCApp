const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePracticePlanCsv } = require('../lib/practicePlanCsv');

test('parsePracticePlanCsv: happy path with every column', () => {
  const rows = [
    {
      Date: '2026-08-24',
      Location: 'Track',
      'Start Time': '3:00 PM',
      Announcements: 'Bring water',
      'Pre Run': 'Dynamic warmup',
      Run: 'Tempo 3x1mi',
      'Post Run': 'Cool down jog',
      'Workout Template': 'Base Tempo',
      'Interval Sheet': '',
      Published: 'TRUE',
    },
  ];
  const { plans, errors, skipped } = parsePracticePlanCsv(rows);
  assert.equal(errors.length, 0);
  assert.equal(skipped, 0);
  assert.deepEqual(plans[0], {
    date: '2026-08-24',
    location: 'Track',
    startTime: '3:00 PM',
    announcements: 'Bring water',
    preRun: 'Dynamic warmup',
    run: 'Tempo 3x1mi',
    postRun: 'Cool down jog',
    workoutTemplate: 'Base Tempo',
    intervalSheet: null,
    published: true,
  });
});

test('parsePracticePlanCsv: only Date is required, everything else optional', () => {
  const rows = [{ Date: '2026-08-25' }];
  const { plans, errors } = parsePracticePlanCsv(rows);
  assert.equal(errors.length, 0);
  assert.deepEqual(plans[0], {
    date: '2026-08-25',
    location: null,
    startTime: null,
    announcements: null,
    preRun: null,
    run: null,
    postRun: null,
    workoutTemplate: null,
    intervalSheet: null,
    published: false,
  });
});

test('parsePracticePlanCsv: a blank date row is skipped, not an error', () => {
  const rows = [{ Date: '' }, { Date: '2026-08-26' }];
  const { plans, errors, skipped } = parsePracticePlanCsv(rows);
  assert.equal(skipped, 1);
  assert.equal(errors.length, 0);
  assert.equal(plans.length, 1);
});

test('parsePracticePlanCsv: an unparseable date is a per-row error, not fatal', () => {
  const rows = [{ Date: '08/26/2026' }, { Date: '2026-08-27' }];
  const { plans, errors } = parsePracticePlanCsv(rows);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Unparseable date/);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].date, '2026-08-27');
});

test('parsePracticePlanCsv: missing the Date column entirely is fatal', () => {
  const rows = [{ Location: 'Track' }];
  const { plans, errors } = parsePracticePlanCsv(rows);
  assert.equal(plans.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Missing required column/);
});

test('parsePracticePlanCsv: no data rows at all', () => {
  const { plans, errors } = parsePracticePlanCsv([]);
  assert.equal(plans.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /no data rows/);
});
