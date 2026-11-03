const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildSeriesHistory, sameDistance } = require('../lib/meetSeriesHistory');

const fin = (athleteId, time, gender) => ({ athleteId, time, status: 'FINISHED', gender });
const races = [
  { id: 'r26', season: 2026, date: '2026-09-20', name: 'Apple Ridge', distance: '5000m', distanceMeters: 5000, results: [fin('a', 1000, 'M'), fin('b', 1200, 'F'), { athleteId: 'c', time: 900, status: 'DNF', gender: 'M' }] },
  { id: 'r25', season: 2025, date: '2025-09-21', name: 'Apple Ridge', distance: '5K', distanceMeters: 5000.2, results: [fin('a', 1040, 'M'), fin('d', 1100, 'M')] },
  { id: 'r24', season: 2024, date: '2024-09-22', name: 'Apple Ridge', distance: '3 Miles', distanceMeters: 4828, results: [fin('e', 950, 'M')] },
  { id: 'r23', season: 2023, date: '2023-09-22', name: 'Apple Ridge', distance: null, distanceMeters: null, results: [fin('f', 990, 'M')] },
];

test('one row per season, newest first, with finishers and averages by gender (DNF excluded)', () => {
  const rows = buildSeriesHistory(races);
  assert.deepEqual(rows.map((r) => r.season), [2026, 2025, 2024, 2023]);
  assert.equal(rows[0].finishers, 2);
  assert.deepEqual(rows[0].bySex, { M: { finishers: 1, avgSec: 1000 }, F: { finishers: 1, avgSec: 1200 } });
  assert.equal(rows[1].bySex.M.avgSec, 1070);
});

test('compares only with the most recent earlier season at the same distance', () => {
  const rows = buildSeriesHistory(races);
  assert.deepEqual(rows[0].comparedTo, { season: 2025, deltaSec: { M: -70, F: null } });
  assert.equal(rows[1].comparedTo, null, '2025 5K has no earlier 5K — 2024 was 3 miles');
  assert.equal(rows[2].comparedTo, null, '3 miles is never compared to a 5K');
  assert.equal(rows[3].comparedTo, null, 'no distance on record → never compared');
});

test('returns no athlete rows — only the viewer\'s own result', () => {
  const rows = buildSeriesHistory(races, { viewerAthleteId: 'a' });
  assert.deepEqual(rows[0].mine, { raceId: 'r26', timeSec: 1000 });
  assert.equal(rows[2].mine, null);
  const serialized = JSON.stringify(buildSeriesHistory(races));
  for (const id of ['"a"', '"b"', '"d"', '"e"']) assert.ok(!serialized.includes(id), `athlete ${id} leaked`);
});

test('sameDistance: within 1%, and never 5K vs 3 miles', () => {
  assert.ok(sameDistance(5000, 5000.2));
  assert.ok(!sameDistance(5000, 4828));
  assert.ok(!sameDistance(null, 5000));
});

test('GET /meet-groups/:groupId/history is read-only, team-scoped, and returns only aggregates', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meetGroups.js'), 'utf8');
  const start = src.indexOf("router.get('/:groupId/history'");
  assert.ok(start > -1, 'route exists');
  const route = src.slice(start, start + 2200);
  assert.match(route, /authenticate, requireTeam/);
  assert.match(route, /teamId: req\.user\.teamId/, 'series must belong to the caller\'s team');
  assert.match(route, /buildSeriesHistory\(/);
  assert.match(route, /viewerAthleteId: req\.user\.linkedAthlete\?\.id/);
  assert.doesNotMatch(route, /prisma\.\w+\.(create|update|upsert|delete)/, 'read-only');
});
