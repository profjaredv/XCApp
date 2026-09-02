// The comparison lines on an athlete's Career Progress chart. The card
// claimed to show team/boys/girls averages while passing null for all
// three, so it drew a legend for series that never appeared. These are the
// rules that make the lines comparable to the athlete's own.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCareerComparison, summarizeGroupSeason, isFiveK } = require('../lib/careerComparison');

const FIVE_K = 5000;
const MILE = 1609.34;

function row(athleteId, season, timeSec, overrides = {}) {
  return { athleteId, gender: 'M', season, timeSec, distanceMeters: FIVE_K, ...overrides };
}

test('a 5K is a band, not exactly 5000 metres', () => {
  assert.equal(isFiveK(4950), true, 'a short-measured course is still a 5K');
  assert.equal(isFiveK(5080), true);
  assert.equal(isFiveK(4800), false);
  assert.equal(isFiveK(8000), false);
});

test('the group 5K average is a mean of bests, matching the athlete line', () => {
  // The athlete's own line is their BEST 5K of the season. Averaging every
  // race a teammate ran against one athlete's best would make everyone
  // look faster than the field.
  const summary = summarizeGroupSeason([
    row('a', 2025, 1200),
    row('a', 2025, 1100), // a's best
    row('b', 2025, 1300),
  ]);
  assert.equal(summary.avg5K, (1100 + 1300) / 2);
});

test('the group pace aggregates seconds over miles, matching how team pace is computed elsewhere', () => {
  const summary = summarizeGroupSeason([
    row('a', 2025, 1200),
    row('b', 2025, 1800, { distanceMeters: 8000 }),
  ]);
  const expected = (1200 + 1800) / ((FIVE_K + 8000) / MILE);
  assert.ok(Math.abs(summary.avgPace - expected) < 0.001);
});

test('a race with no usable time or distance is skipped, never averaged as zero', () => {
  const summary = summarizeGroupSeason([
    row('a', 2025, 1200),
    row('b', 2025, 0),
    row('c', 2025, 1000, { distanceMeters: 0 }),
  ]);
  assert.equal(summary.athleteCount, 1);
  assert.equal(summary.avg5K, 1200);
});

test('a team that never races 5Ks gets a pace line and no 5K line, not a zero', () => {
  const summary = summarizeGroupSeason([row('a', 2025, 1500, { distanceMeters: 3000 })]);
  assert.equal(summary.avg5K, null);
  assert.ok(summary.avgPace > 0);
});

test('boys and girls are separate series, and the team line includes both', () => {
  const rows = [
    row('boy', 2025, 1100),
    row('girl', 2025, 1300, { gender: 'F' }),
  ];
  const [season] = buildCareerComparison(rows, 'boy');
  assert.equal(season.boys5K, 1100);
  assert.equal(season.girls5K, 1300);
  assert.equal(season.team5K, 1200, 'the team line mixes them — that is what team average means');
});

test('the athlete is measured from the same rows as the lines they are compared against', () => {
  const rows = [row('a', 2025, 1100), row('b', 2025, 1300)];
  const [season] = buildCareerComparison(rows, 'a');
  assert.equal(season.athlete5K, 1100);
  assert.equal(season.team5K, 1200);
});

test('one season per row, oldest first', () => {
  const rows = [row('a', 2026, 1100), row('a', 2024, 1300), row('a', 2025, 1200)];
  assert.deepEqual(buildCareerComparison(rows, 'a').map((s) => s.season), [2024, 2025, 2026]);
});

test('every average carries the number of athletes standing behind it', () => {
  // A "boys average" of one is that athlete's own line drawn twice; the
  // chart needs to know so it can drop the series instead.
  const rows = [row('a', 2025, 1100), row('b', 2025, 1200), row('girl', 2025, 1300, { gender: 'F' })];
  const [season] = buildCareerComparison(rows, 'a');
  assert.deepEqual(season.counts, { team: 3, boys: 2, girls: 1 });
});

test('an athlete with no results produces no rows at all', () => {
  assert.deepEqual(buildCareerComparison([], 'a'), []);
});
