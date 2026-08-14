const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimeToSeconds } = require('../lib/time');
const { parseFieldResultsCsv } = require('../lib/fieldResultsCsv');
const { computeFieldStats } = require('../lib/fieldNormalization');

test('parseTimeToSeconds: MM:SS and MM:SS.d', () => {
  assert.equal(parseTimeToSeconds('18:32'), 18 * 60 + 32);
  assert.equal(parseTimeToSeconds('18:32.4'), 18 * 60 + 32.4);
});

test('parseTimeToSeconds: H:MM:SS', () => {
  assert.equal(parseTimeToSeconds('1:05:10'), 3600 + 5 * 60 + 10);
});

test('parseTimeToSeconds: rejects garbage without throwing', () => {
  assert.equal(parseTimeToSeconds(''), null);
  assert.equal(parseTimeToSeconds(null), null);
  assert.equal(parseTimeToSeconds('DNF'), null);
  assert.equal(parseTimeToSeconds('18:xx'), null);
  assert.equal(parseTimeToSeconds('1:2:3:4'), null);
});

test('parseFieldResultsCsv: happy path with School/Gender/Grade/Place', () => {
  const rows = [
    { 'Athlete Name': 'Jane Doe', School: 'Northside', Gender: 'F', Grade: '11', Time: '18:32.4', Place: '3' },
    { 'Athlete Name': 'Sam Lee', School: 'Eastview', Gender: 'F', Grade: '10', Time: '19:01', Place: '5' },
  ];
  const { results, errors, skipped } = parseFieldResultsCsv(rows);
  assert.equal(errors.length, 0);
  assert.equal(skipped, 0);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    athleteName: 'Jane Doe',
    schoolName: 'Northside',
    gender: 'F',
    grade: 11,
    timeSec: 18 * 60 + 32.4,
    place: 3,
    status: 'FINISHED',
  });
});

test('parseFieldResultsCsv: a DNF/DNS/DQ row with no time is valid, not an error', () => {
  const rows = [{ 'Athlete Name': 'Jo Park', Time: '', Status: 'DNF' }];
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(errors.length, 0);
  assert.equal(results[0].status, 'DNF');
  assert.equal(results[0].timeSec, null);
});

test('parseFieldResultsCsv: a FINISHED row with no time is an error, not silently dropped', () => {
  const rows = [{ 'Athlete Name': 'Jo Park', Time: '' }];
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /no time/);
});

test('parseFieldResultsCsv: an unparseable time is an error naming the row and value', () => {
  const rows = [{ 'Athlete Name': 'Jo Park', Time: 'garbage' }];
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 1);
  assert.match(errors[0].message, /garbage/);
});

test('parseFieldResultsCsv: an unrecognized status is an error', () => {
  const rows = [{ 'Athlete Name': 'Jo Park', Time: '18:00', Status: 'MAYBE' }];
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Unrecognized status/);
});

test('parseFieldResultsCsv: a blank athlete name is silently skipped, not an error', () => {
  const rows = [{ 'Athlete Name': '', Time: '18:00' }, { 'Athlete Name': 'Real Athlete', Time: '18:00' }];
  const { results, errors, skipped } = parseFieldResultsCsv(rows);
  assert.equal(skipped, 1);
  assert.equal(errors.length, 0);
  assert.equal(results.length, 1);
});

test('parseFieldResultsCsv: missing the required Athlete Name column fails the whole upload', () => {
  const rows = [{ Time: '18:00' }];
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Missing required column/);
});

test('parseFieldResultsCsv: empty input reports an error rather than silently succeeding with zero rows', () => {
  const { results, errors } = parseFieldResultsCsv([]);
  assert.equal(results.length, 0);
  assert.equal(errors.length, 1);
});

// End-to-end sanity: a race's uploaded field results feed straight into
// the same computeFieldStats() the (still-missing) automated scraper would
// have called — this manual path and a future scraper produce identically
// shaped Race.fieldMeanSec/fieldMedianSec/fieldFinisherCount data.
test('parseFieldResultsCsv output feeds computeFieldStats() directly', () => {
  const rows = Array.from({ length: 42 }, (_, i) => ({
    'Athlete Name': `Athlete ${i}`,
    Time: `${18 + Math.floor(i / 10)}:${String(i % 60).padStart(2, '0')}`,
  }));
  const { results, errors } = parseFieldResultsCsv(rows);
  assert.equal(errors.length, 0);

  const finishedTimes = results.filter((r) => r.status === 'FINISHED').map((r) => r.timeSec);
  const stats = computeFieldStats(finishedTimes);
  assert.equal(stats.fieldFinisherCount, 42);
  assert.notEqual(stats.fieldMeanSec, null); // >= 40 finishers clears MIN_FIELD_SIZE
});
