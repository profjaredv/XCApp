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
    // Also stands in for getAthleteBuildStats' own second team.findUnique
    // call (the coach-credit lookup) — coach: null here means an empty
    // coaches list unless a test overrides this stub itself.
    stub('team', 'findUnique', () => ({ currentSeason: year, coach: null })),
    stub('season', 'findFirst', () => ({ id: 'season-1', year })),
    stub('race', 'findMany', () => []),
    stub('teamMember', 'findMany', () => []),
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

test('getAthleteBuildStats assembles name, grade, career PR, season totals, best-by-distance, and both the season and career race lists', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  // graduationYear 2028 in season 2026 (deriveGrade: 12 - (2028 - 2026 - 1)) = grade 11 (junior).
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alexandra Smith',
    preferredName: 'Alex',
    graduationYear: 2028,
    userId: 'already-linked', // short-circuits the invite-token lookup — not what this test covers
  }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', (args) => {
    assert.deepEqual(args.where.athleteId_teamId_season, { athleteId: 'athlete-1', teamId: 'team-1', season: 2026 });
    return { totalMiles: 142.3, averagePace: 444, totalRaces: 9, bestTime5k: 1052 };
  });
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', (args) => {
    assert.deepEqual(args.where, { teamId: 'team-1', athleteId: 'athlete-1' });
    return { _min: { bestTime5k: 1030 } }; // career PR, faster (lower) than this season's own best
  });
  // Two prisma.result.findMany calls happen (season-scoped, then
  // career-wide) — distinguished by whether `where.race.season` is set,
  // since this codebase's stub() replaces the method for every call in
  // the test, not just one.
  const restoreResults = stub('result', 'findMany', (args) => {
    assert.equal(args.where.athleteId, 'athlete-1');
    if (args.where.race?.season) {
      assert.equal(args.where.race.season, 2026);
      return [
        { time: 1052, race: { id: 'race-1', name: 'EHS Invitational', date: new Date('2026-09-05'), distanceMeters: 5000, distance: '5K' } },
        { time: 665, race: { id: 'race-2', name: 'Relay Classic', date: new Date('2026-09-12'), distanceMeters: 3200, distance: '2 Mile' } },
      ];
    }
    assert.equal('race' in args.where, false, 'the career query must not filter by race at all');
    return [
      { time: 1180, race: { id: 'race-0', name: 'Freshman Opener', date: new Date('2024-09-03'), distanceMeters: 5000, distance: '5K', season: 2024 } },
      { time: 1052, race: { id: 'race-1', name: 'EHS Invitational', date: new Date('2026-09-05'), distanceMeters: 5000, distance: '5K', season: 2026 } },
      { time: 665, race: { id: 'race-2', name: 'Relay Classic', date: new Date('2026-09-12'), distanceMeters: 3200, distance: '2 Mile', season: 2026 } },
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
  assert.equal(stats.grade, 11);
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
  assert.equal(stats.careerRaces.length, 3);
  assert.equal(stats.careerRaces[0].raceName, 'Freshman Opener');
  assert.equal(stats.careerRaces[0].season, 2024);
});

// A race scraped with only its text distance set (distanceMeters still
// null, pending a later parse pass) must not silently drop out of
// best-by-distance or the career race list — same
// distanceMeters ?? parseDistanceToMeters(distance) fallback
// routes/analytics.js's athlete-journey endpoint already applies.
test('getAthleteBuildStats falls back to parsing the text distance when distanceMeters is null', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alex',
    preferredName: null,
    graduationYear: 2027,
    userId: 'already-linked',
  }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', (args) => {
    if (args.where.race?.season) {
      return [{ time: 323, race: { id: 'race-1', name: 'Reed Park Time Trial', date: new Date('2026-09-08'), distanceMeters: null, distance: '1.5 Miles' } }];
    }
    return [{ time: 323, race: { id: 'race-1', name: 'Reed Park Time Trial', date: new Date('2026-09-08'), distanceMeters: null, distance: '1.5 Miles', season: 2026 } }];
  });
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);

  assert.equal(stats.races[0].distanceMeters, 1.5 * 1609.34);
  assert.equal(stats.bestByDistance.length, 1, 'the only race at its distance is trivially a PR, so it must still be flagged even with distanceMeters originally null');
  assert.equal(stats.bestByDistance[0].raceName, 'Reed Park Time Trial');
  assert.equal(stats.careerRaces[0].distanceMeters, 1.5 * 1609.34);
});

test('getAthleteBuildStats grade is null when graduationYear is unknown, not a guess', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alex',
    preferredName: null,
    graduationYear: null,
    userId: 'already-linked', // short-circuits the invite-token lookup — not what this test covers
  }));
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

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.equal(stats.grade, null);
});

test('getAthleteBuildStats falls back to counting this season\'s results when there is no AthleteSeasonMetrics row yet', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null, userId: 'already-linked' }));
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
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null, userId: 'already-linked' }));
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

test('getAthleteBuildStats orders the coach list head coach, then coach, then volunteer coach', async (t) => {
  // Overrides withActiveSeason's own team.findUnique/teamMember.findMany
  // stubs with ones that actually carry coach data, same "stub the thing
  // this one test cares about" pattern as the metrics/aggregate overrides
  // in the 'assembles' test above. The TeamMember rows are deliberately
  // NOT in role order (volunteer before assistant) — mergeStaffRoster
  // itself only promises insertion order, so this proves the role sort
  // is actually doing something, not just happening to already match.
  const restoreTeam = stub('team', 'findUnique', () => ({
    currentSeason: 2026,
    coach: { id: 'coach-1', name: 'Pat Owner', email: 'pat@x.com' },
  }));
  const restoreSeasonRow = stub('season', 'findFirst', () => ({ id: 'season-1', year: 2026 }));
  const restoreRace = stub('race', 'findMany', () => []);
  const restoreTeamMember = stub('teamMember', 'findMany', () => [
    { userId: 'coach-3', role: 'VOLUNTEER_COACH', user: { name: 'Volunteer Val', email: 'val@x.com' } },
    { userId: 'coach-2', role: 'COACH', user: { name: 'Jamie Assistant', email: 'jamie@x.com' } },
  ]);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null, userId: 'already-linked' }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  t.after(() => {
    restoreTeam();
    restoreSeasonRow();
    restoreRace();
    restoreTeamMember();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.deepEqual(stats.coaches, { headCoaches: ['Pat Owner'], coaches: ['Jamie Assistant'], volunteers: ['Volunteer Val'] });
});

// A team can have more than one HEAD_COACH row (co-head coaches) — an
// earlier version of this picked only the first HEAD_COACH found
// (rankedCoaches.find), which silently dropped every head coach after it
// from the printed collage. headCoaches must carry all of them.
test('getAthleteBuildStats keeps every head coach, not just the first one found', async (t) => {
  const restoreTeam = stub('team', 'findUnique', () => ({
    currentSeason: 2026,
    coach: { id: 'coach-1', name: 'Pat Owner', email: 'pat@x.com' },
  }));
  const restoreSeasonRow = stub('season', 'findFirst', () => ({ id: 'season-1', year: 2026 }));
  const restoreRace = stub('race', 'findMany', () => []);
  const restoreTeamMember = stub('teamMember', 'findMany', () => [
    // A second HEAD_COACH, distinct from the team owner's own synthesized
    // HEAD_COACH entry — a real co-head-coach scenario, not a dedupe of
    // the same person.
    { userId: 'coach-4', role: 'HEAD_COACH', user: { name: 'Jeff Hashimoto', email: 'jeff@x.com' } },
    { userId: 'coach-3', role: 'VOLUNTEER_COACH', user: { name: 'Volunteer Val', email: 'val@x.com' } },
  ]);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1', name: 'Alex', preferredName: null, userId: 'already-linked' }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  t.after(() => {
    restoreTeam();
    restoreSeasonRow();
    restoreRace();
    restoreTeamMember();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.deepEqual(stats.coaches.headCoaches.sort(), ['Jeff Hashimoto', 'Pat Owner']);
});

test('getAthleteBuildStats issues a fresh collage invite token for an eligible, unlinked athlete', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  // graduationYear 2028 in season 2026 is grade 11 — well above the 9th-grade floor.
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alex',
    preferredName: null,
    graduationYear: 2028,
    userId: null,
  }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  const restoreInviteFind = stub('athleteInvite', 'findUnique', () => null);
  const restoreInviteCreate = stub('athleteInvite', 'create', (args) => ({ token: 'brand-new-token', ...args.data }));
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
    restoreInviteFind();
    restoreInviteCreate();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.equal(stats.inviteToken, 'brand-new-token');
});

test('getAthleteBuildStats has no invite token for an athlete who already has an account', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alex',
    preferredName: null,
    graduationYear: 2028,
    userId: 'user-1',
  }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  const restoreInviteFind = stub('athleteInvite', 'findUnique', () => {
    throw new Error('must not look up an invite for an already-linked athlete');
  });
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
    restoreInviteFind();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.equal(stats.inviteToken, null);
});

test('getAthleteBuildStats reuses an existing pending, unexpired invite token rather than rotating it', async (t) => {
  const restoreSeason = withActiveSeason(2026);
  const restoreAthlete = stub('athlete', 'findFirst', () => ({
    id: 'athlete-1',
    name: 'Alex',
    preferredName: null,
    graduationYear: 2028,
    userId: null,
  }));
  const restoreMetrics = stub('athleteSeasonMetrics', 'findUnique', () => null);
  const restoreAggregate = stub('athleteSeasonMetrics', 'aggregate', () => ({ _min: { bestTime5k: null } }));
  const restoreResults = stub('result', 'findMany', () => []);
  const restoreInviteFind = stub('athleteInvite', 'findUnique', () => ({
    token: 'already-printed-token',
    status: 'pending',
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  }));
  const restoreInviteUpdate = stub('athleteInvite', 'update', () => {
    throw new Error('must not rotate a token that is already live');
  });
  t.after(() => {
    restoreSeason();
    restoreAthlete();
    restoreMetrics();
    restoreAggregate();
    restoreResults();
    restoreInviteFind();
    restoreInviteUpdate();
  });

  const stats = await getAthleteBuildStats(prisma, 'team-1', 'athlete-1', COACH);
  assert.equal(stats.inviteToken, 'already-printed-token');
});
