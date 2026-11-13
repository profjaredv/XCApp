const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseScoringTable, seasonLeaders, pointsFor, pointsContribution, athleteProgression, DEFAULT_SCORING_TABLE } = require('../lib/trackAnalytics');

const E100 = { id: 'e100', name: '100 Meters', scoringDirection: 'LOWER_BETTER', sortOrder: 10 };
const ESP = { id: 'esp', name: 'Shot Put', scoringDirection: 'HIGHER_BETTER', sortOrder: 180 };
const EVENTS = [ESP, E100];

const row = (o) => ({ status: 'FINISHED', round: 'FINAL', season: 2026, date: '2026-04-01', place: null, ...o });

test('seasonLeaders: lower wins a sprint, higher wins a throw, one row per athlete', () => {
  const out = seasonLeaders(
    [
      row({ eventId: 'e100', athleteId: 'a', markValue: 11.9 }),
      row({ eventId: 'e100', athleteId: 'a', markValue: 11.5 }),
      row({ eventId: 'e100', athleteId: 'b', markValue: 11.2 }),
      row({ eventId: 'esp', athleteId: 'a', markValue: 400 }),
      row({ eventId: 'esp', athleteId: 'b', markValue: 450 }),
      row({ eventId: 'esp', athleteId: 'b', markValue: 410 }),
    ],
    EVENTS
  );
  assert.deepEqual(out.map((e) => e.event.name), ['100 Meters', 'Shot Put']); // catalog order
  assert.deepEqual(out[0].leaders.map((l) => [l.athleteId, l.markValue]), [['b', 11.2], ['a', 11.5]]);
  assert.deepEqual(out[1].leaders.map((l) => [l.athleteId, l.markValue]), [['b', 450], ['a', 400]]);
});

test('seasonLeaders: DNS/NM rows and relay rows never rank', () => {
  const out = seasonLeaders(
    [
      row({ eventId: 'e100', athleteId: 'a', markValue: null, status: 'DNS' }),
      row({ eventId: 'e100', athleteId: null, markValue: 44 }),
    ],
    EVENTS
  );
  assert.deepEqual(out, []);
});

test('pointsFor: finals by place on the default table, nothing for prelims or non-finishers', () => {
  assert.deepEqual(DEFAULT_SCORING_TABLE, [10, 8, 6, 5, 4, 3, 2, 1]);
  assert.equal(pointsFor(row({ place: 1 })), 10);
  assert.equal(pointsFor(row({ place: 8 })), 1);
  assert.equal(pointsFor(row({ place: 9 })), 0);
  assert.equal(pointsFor(row({ place: null })), 0);
  assert.equal(pointsFor(row({ place: 1, round: 'PRELIM' })), 0);
  assert.equal(pointsFor(row({ place: 1, status: 'DQ' })), 0);
  assert.equal(pointsFor(row({ place: 2 }), [5, 3, 1]), 3);
});

test('pointsContribution: sums by event and season, counting distinct scorers', () => {
  const out = pointsContribution(
    [
      row({ eventId: 'e100', athleteId: 'a', place: 1, season: 2025 }),
      row({ eventId: 'e100', athleteId: 'a', place: 2, season: 2026 }),
      row({ eventId: 'e100', athleteId: 'a', place: 3, season: 2026 }),
      row({ eventId: 'e100', athleteId: 'b', place: 12, season: 2026 }),
      row({ eventId: 'esp', athleteId: 'b', place: 20, season: 2026 }),
    ],
    EVENTS
  );
  assert.deepEqual(out.seasons, [2025, 2026]);
  const sprint = out.events.find((e) => e.event.id === 'e100');
  assert.deepEqual(sprint.bySeason[2025], { points: 10, scorers: 1, entrants: 1 });
  assert.deepEqual(sprint.bySeason[2026], { points: 14, scorers: 1, entrants: 2 });
  const shot = out.events.find((e) => e.event.id === 'esp');
  assert.deepEqual(shot.bySeason[2026], { points: 0, scorers: 0, entrants: 1 });
  assert.equal(shot.bySeason[2025], undefined);
});

test('athleteProgression: flags each new PR in date order and keeps season bests', () => {
  const out = athleteProgression(
    [
      row({ eventId: 'esp', markValue: 410, date: '2026-04-10' }),
      row({ eventId: 'esp', markValue: 400, date: '2025-04-01', season: 2025 }),
      row({ eventId: 'esp', markValue: 395, date: '2026-03-20' }),
      row({ eventId: 'esp', markValue: null, status: 'NM', date: '2026-05-01' }),
    ],
    EVENTS
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].pr, 410);
  assert.deepEqual(out[0].marks.map((m) => [m.markValue, m.isPr]), [[400, true], [395, false], [410, true], [null, false]]);
  assert.deepEqual(out[0].seasonBests.map((s) => [s.season, s.best.markValue]), [[2025, 400], [2026, 410]]);
});

test('parseScoringTable: a missing or malformed table falls back, never to a table of zeros', () => {
  assert.equal(parseScoringTable(undefined), null);
  assert.equal(parseScoringTable(''), null);
  assert.equal(parseScoringTable('10,,8'), null);
  assert.equal(parseScoringTable('abc'), null);
  assert.deepEqual(parseScoringTable('5, 3, 1'), [5, 3, 1]);
});
