// lib/photoBuildStats.js: the running-stats block the Build module prints
// onto a collage. Deliberately reuses the app's own existing computations
// (AthleteSeasonMetrics, lib/athleteJourney.js's computePRs, the same
// career-PR definition routes/analytics.js uses) rather than re-deriving
// them — these tests pin the assembly, not the math those already-tested
// modules do.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { getAthleteBuildStats } = require('../lib/photoBuildStats');

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

function withActiveSeason(year) {
  const restores = [
    stub('team', 'findUnique', () => ({ currentSeason: year })),
    stub('season', 'findFirst', () => ({ id: 'season-1', year })),
    stub('race', 'findMany', () => []),
  ];
  return () => restores.forEach((r) => r());
}

const COACH = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
const UNRELATED_GUARDIAN = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['someone-else'], linkedAthleteIds: ['someone-else'] };
const OWN_GUARDIAN = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-1'], linkedAthleteIds: ['athlete-1'] };

test('getAthleteBuildStats refuses an account with no authority over this athlete', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  t.after(restoreSeason);
  await assert.rejects(
    () => getAthleteBuildStats(prisma, 'team-1', 'athlete-1', UNRELATED_GUARDIAN),
    /cannot view that athlete's stats/,
  );
});

test('getAthleteBuildStats 404s an athlete from another team', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => null);
  t.after(() => {
    restoreSeason();
    restoreAthlete();
  });
  await assert.rejects(() => getAthleteBuildStats(prisma, 'team-1', 'athlete-of-another-team', COACH), /Athlete not found/);
});

test('getAthleteBuildStats assembles name, career PR, season totals, best-by-distance and the race list', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alexandra Smith', preferredName: 'Alex' }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', (args) => {
    assert.deepEqual(args.where.athleteId_teamId_season, { athleteId: 'athlete-1', teamId: 'team-1', season: 2026 });
    return { totalMiles: 142.3, averagePace: 444, totalRaces: 9, bestTime5k: 1052 };
  });
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', (args) => {
    assert.deepEqual(args.where, { teamId: 'team-1', athleteId: 'athlete-1' });
    return { _min: { bestTime5k: 1030 } }; // career PR, faster (lower) than this season's own best
  });
  const restoreResults = stub('result', 'findMany', (args) => {
    assert.equal(args.where.athleteId, 'athlete-1');
    assert.equal(args.where.race.season, 2026);
    return [
      { time: 1052, race: { id: 'race-1', name: 'EHS Invitational', date: new Date('2026-09-05'), distanceMeters: 5000, distance: '5K' } },
      { time: 665, race: { id: 'race-2', name: 'Relay Classic', date: new Date('2026-09-12'), distanceMeters: 3200, distance: '2 Mile' } },
    ];
  });
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);

  assert.equal(stats.name, 'Alex');
  assert.equal(stats.season, 2026);
  assert.equal(stats.careerBest5kSec, 1030);
  assert.equal(stats.totalMiles, 142.3);
  assert.equal(stats.averagePaceSecPerMile, 444);
  assert.equal(stats.totalRaces, 9);
  assert.equal(stats.races.length, 2);
  assert.equal(stats.races[0].raceName, 'EHS Invitational');
  assert.equal(stats.races[0].timeSec, 1052);
  assert.equal(stats.bestByDistance.length, 2);
  assert.ok(stats.bestByDistance.some((d) => d.distanceMeters === 5000 && d.timeSec === 1052));
  assert.ok(stats.bestByDistance.some((d) => d.distanceMeters === 3200 && d.timeSec === 665));
});

test('getAthleteBuildStats falls back to counting this season\'s results when there is no AthleteSeasonMetrics row yet', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => [
    { time: 1100, race: { id: 'race-1', name: 'Season Opener', date: new Date('2026-09-01'), distanceMeters: 5000, distance: '5K' } },
  ]);
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.equal(stats.totalMiles, null);
  assert.equal(stats.averagePaceSecPerMile, null);
  assert.equal(stats.careerBest5kSec, null);
  assert.equal(stats.totalRaces, 1); // no metrics row: falls back to the actual season results count
});

test('a family account reaches its own linked athlete\'s stats', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', OWN_GUARDIAN);
  assert.equal(stats.name, 'Alex');
});
