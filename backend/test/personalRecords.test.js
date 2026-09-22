// lib/personalRecords.js — whether a result was a PR or season best, at
// the one distance it was compared within.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computePrFlagsByRace } = require('../lib/personalRecords');

const row = (raceId, time, date, season) => ({ raceId, time, date, season });

test('a first-ever race at a distance is trivially a PR and a season best', () => {
  const flags = computePrFlagsByRace([row('r1', 1200, '2024-09-07', 2024)]);
  assert.deepEqual(flags.get('r1'), { pr: true, seasonBest: true });
});

test('a faster later race is a PR; the earlier one keeps its PR flag from the day it was run', () => {
  const rows = [row('r1', 1200, '2024-09-07', 2024), row('r2', 1150, '2024-09-21', 2024)];
  const flags = computePrFlagsByRace(rows);
  assert.equal(flags.get('r1').pr, true); // was a PR the day it happened
  assert.equal(flags.get('r2').pr, true); // beat it
});

test('a slower later race is neither a PR nor a season best', () => {
  const rows = [row('r1', 1150, '2024-09-07', 2024), row('r2', 1200, '2024-09-21', 2024)];
  const flags = computePrFlagsByRace(rows);
  assert.equal(flags.get('r2').pr, false);
  assert.equal(flags.get('r2').seasonBest, false);
});

test('order of input does not matter — sorted internally by date', () => {
  const rows = [row('r2', 1200, '2024-09-21', 2024), row('r1', 1150, '2024-09-07', 2024)];
  const flags = computePrFlagsByRace(rows);
  assert.equal(flags.get('r1').pr, true);
  assert.equal(flags.get('r2').pr, false);
});

test('a tied time counts as matching the standing best, not missing it', () => {
  const rows = [row('r1', 1200, '2024-09-07', 2024), row('r2', 1200, '2024-09-21', 2024)];
  const flags = computePrFlagsByRace(rows);
  assert.equal(flags.get('r2').pr, true);
  assert.equal(flags.get('r2').seasonBest, true);
});

test('season best resets each season, career PR does not', () => {
  const rows = [
    row('r1', 1150, '2024-09-07', 2024), // career PR + 2024 season best
    row('r2', 1200, '2025-09-06', 2025), // slower than career PR, but first race of 2025
  ];
  const flags = computePrFlagsByRace(rows);
  assert.deepEqual(flags.get('r2'), { pr: false, seasonBest: true });
});

test('a new career PR is also automatically that season\'s best', () => {
  const rows = [
    row('r1', 1150, '2024-09-07', 2024),
    row('r2', 1200, '2025-09-06', 2025),
    row('r3', 1100, '2025-09-20', 2025), // beats both the career PR and the 2025 best
  ];
  const flags = computePrFlagsByRace(rows);
  assert.deepEqual(flags.get('r3'), { pr: true, seasonBest: true });
});

test('every raceId passed in gets an entry, including races that were neither PR nor season best', () => {
  const rows = [row('r1', 1100, '2024-09-07', 2024), row('r2', 1300, '2024-09-21', 2024)];
  const flags = computePrFlagsByRace(rows);
  assert.equal(flags.size, 2);
  assert.deepEqual(flags.get('r2'), { pr: false, seasonBest: false });
});

test('an empty history returns an empty map, not a throw', () => {
  const flags = computePrFlagsByRace([]);
  assert.equal(flags.size, 0);
});
