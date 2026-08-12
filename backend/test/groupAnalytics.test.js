const test = require('node:test');
const assert = require('node:assert/strict');
const { paceSecPerMile, summarizeRaces, buildAthleteSeasonSummary, summarizeGroup, summarizeGroupAtRace } = require('../lib/groupAnalytics');

test('paceSecPerMile: 5000m in 1000s', () => {
  // 5000m = 3.10686 mi; 1000s / 3.10686mi = 321.868 s/mile
  const pace = paceSecPerMile(1000, 5000);
  assert.ok(Math.abs(pace - 321.868) < 0.01);
});

test('paceSecPerMile: a mile race in 400s is exactly 400 s/mile', () => {
  assert.equal(paceSecPerMile(400, 1609.34), 400);
});

test('paceSecPerMile: missing or zero time/distance returns null, never 0 or Infinity', () => {
  assert.equal(paceSecPerMile(null, 5000), null);
  assert.equal(paceSecPerMile(1000, null), null);
  assert.equal(paceSecPerMile(0, 5000), null);
  assert.equal(paceSecPerMile(1000, 0), null);
});

test('summarizeRaces: best is the fastest (lowest) pace, avg is the mean', () => {
  const races = [
    { timeSec: 1000, distanceMeters: 5000 }, // 321.868 s/mi
    { timeSec: 900, distanceMeters: 5000 }, // 289.681 s/mi (faster)
  ];
  const s = summarizeRaces(races);
  assert.equal(s.raceCount, 2);
  assert.equal(s.paceRaceCount, 2);
  assert.ok(Math.abs(s.bestPaceSecPerMile - 289.681) < 0.01);
  assert.ok(Math.abs(s.avgPaceSecPerMile - (321.868 + 289.681) / 2) < 0.01);
});

test('summarizeRaces: a race with no parseable distance is excluded from pace stats but still counted', () => {
  const races = [
    { timeSec: 1000, distanceMeters: 5000 },
    { timeSec: 800, distanceMeters: null },
  ];
  const s = summarizeRaces(races);
  assert.equal(s.raceCount, 2);
  assert.equal(s.paceRaceCount, 1);
});

test('summarizeRaces: empty or all-unparseable input returns null, not zeros', () => {
  assert.equal(summarizeRaces([]), null);
  assert.equal(summarizeRaces([{ timeSec: null, distanceMeters: 5000 }]), null);
});

test('buildAthleteSeasonSummary: uses current season when it has data, flags isFallback false', () => {
  const summary = buildAthleteSeasonSummary({
    targetSeason: 2026,
    currentSeasonRaces: [{ timeSec: 1000, distanceMeters: 5000 }],
    priorSeasonsByYearDesc: [{ year: 2025, races: [{ timeSec: 900, distanceMeters: 5000 }] }],
  });
  assert.equal(summary.season, 2026);
  assert.equal(summary.isFallback, false);
});

test('buildAthleteSeasonSummary: falls back to the most recent prior season with data when current season is empty', () => {
  const summary = buildAthleteSeasonSummary({
    targetSeason: 2026,
    currentSeasonRaces: [],
    priorSeasonsByYearDesc: [
      { year: 2025, races: [] }, // ran cross country in 2025 but... no pace-computable race (edge case)
      { year: 2024, races: [{ timeSec: 1200, distanceMeters: 5000 }] },
    ],
  });
  assert.equal(summary.season, 2024);
  assert.equal(summary.isFallback, true);
});

test('buildAthleteSeasonSummary: an athlete who has never raced returns null, not a zero-pace object', () => {
  const summary = buildAthleteSeasonSummary({ targetSeason: 2026, currentSeasonRaces: [], priorSeasonsByYearDesc: [] });
  assert.equal(summary, null);
});

test('summarizeGroup: aggregate only counts current-season (non-fallback) athletes, fallback athletes are visible but excluded from the number', () => {
  const summaries = [
    { season: 2026, isFallback: false, bestPaceSecPerMile: 300, avgPaceSecPerMile: 310, raceCount: 3, paceRaceCount: 3 },
    { season: 2026, isFallback: false, bestPaceSecPerMile: 330, avgPaceSecPerMile: 340, raceCount: 2, paceRaceCount: 2 },
    { season: 2025, isFallback: true, bestPaceSecPerMile: 250, avgPaceSecPerMile: 260, raceCount: 5, paceRaceCount: 5 },
    null, // never raced
  ];
  const g = summarizeGroup(summaries);
  assert.equal(g.athleteCount, 4);
  assert.equal(g.currentSeasonCount, 2);
  assert.equal(g.fallbackCount, 1);
  assert.equal(g.neverRacedCount, 1);
  // A blazing-fast 2025 fallback pace (250) must NOT pull the group's
  // "this season" best/avg down — only the two 2026 entries count.
  assert.equal(g.bestPaceSecPerMile, 300);
  assert.equal(g.avgPaceSecPerMile, (310 + 340) / 2);
});

test('summarizeGroup: no current-season data at all yields null aggregate numbers, not zero/NaN', () => {
  const summaries = [{ season: 2025, isFallback: true, bestPaceSecPerMile: 300, avgPaceSecPerMile: 300, raceCount: 1, paceRaceCount: 1 }];
  const g = summarizeGroup(summaries);
  assert.equal(g.avgPaceSecPerMile, null);
  assert.equal(g.bestPaceSecPerMile, null);
  assert.equal(g.fallbackCount, 1);
});

test('summarizeGroupAtRace: min/avg/max across the group finishers at one meet', () => {
  const s = summarizeGroupAtRace([300, 320, 340]);
  assert.equal(s.athleteCount, 3);
  assert.equal(s.minPaceSecPerMile, 300);
  assert.equal(s.maxPaceSecPerMile, 340);
  assert.equal(s.avgPaceSecPerMile, 320);
});

test('summarizeGroupAtRace: a single finisher has min === avg === max', () => {
  const s = summarizeGroupAtRace([310]);
  assert.equal(s.minPaceSecPerMile, 310);
  assert.equal(s.avgPaceSecPerMile, 310);
  assert.equal(s.maxPaceSecPerMile, 310);
});

test('summarizeGroupAtRace: nulls/zeros/negatives are excluded, not treated as a fast pace', () => {
  const s = summarizeGroupAtRace([300, null, 0, -5, 320]);
  assert.equal(s.athleteCount, 2);
  assert.equal(s.minPaceSecPerMile, 300);
  assert.equal(s.maxPaceSecPerMile, 320);
});

test('summarizeGroupAtRace: no valid paces returns null, not zeros', () => {
  assert.equal(summarizeGroupAtRace([]), null);
  assert.equal(summarizeGroupAtRace([null, 0, -1]), null);
});
