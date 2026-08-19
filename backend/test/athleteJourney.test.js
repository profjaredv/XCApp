const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rankAthletesBySeasonBestPace,
  bandForSeasonRank,
  computeSeasonBest,
  computeCourseBests,
  computePRs,
} = require('../lib/athleteJourney');

test('rankAthletesBySeasonBestPace: ranks by each athlete\'s BEST pace, not their most recent', () => {
  const entries = [
    { athleteId: 'a', paceSecPerMile: 400 },
    { athleteId: 'a', paceSecPerMile: 380 }, // a's best
    { athleteId: 'b', paceSecPerMile: 390 },
  ];
  const { byAthleteId, rosterSize } = rankAthletesBySeasonBestPace(entries);
  assert.equal(rosterSize, 2);
  assert.equal(byAthleteId.get('a').rank, 1);
  assert.equal(byAthleteId.get('a').bestPaceSecPerMile, 380);
  assert.equal(byAthleteId.get('b').rank, 2);
});

test('bandForSeasonRank: the exact "9th of 58" style example — 9th of a 58-roster season is top band', () => {
  // 58-athlete roster, default topSize=20 -> ranks 1-20 are top.
  assert.equal(bandForSeasonRank(9, 58), 'top');
  assert.equal(bandForSeasonRank(58, 58), 'bottom');
});

test('bandForSeasonRank: null roster size (no data) returns null, not a crash', () => {
  assert.equal(bandForSeasonRank(1, 0), null);
  assert.equal(bandForSeasonRank(1, null), null);
});

test('computeSeasonBest: picks the fastest PACE race, reports both its pace and its own raw time', () => {
  const results = [
    { raceId: 'r1', raceName: '5K Opener', date: '2025-09-01', time: 1200, distanceMeters: 5000 }, // 6:26/mi
    { raceId: 'r2', raceName: '2 Mile Invite', date: '2025-09-15', time: 700, distanceMeters: 3218.68 }, // 5:52/mi, faster
  ];
  const best = computeSeasonBest(results);
  assert.equal(best.raceId, 'r2');
  assert.equal(best.timeSec, 700);
  assert.ok(best.paceSecPerMile < 400); // ~352 sec/mi
});

test('computeSeasonBest: null when nothing has a usable distance', () => {
  assert.equal(computeSeasonBest([{ raceId: 'r1', raceName: 'x', date: '2025-09-01', time: 1200, distanceMeters: null }]), null);
});

test('computeCourseBests: only courses raced 2+ times, delta is worst-minus-best (positive = improved)', () => {
  const results = [
    { raceId: 'r1', raceName: 'A', date: '2025-09-01', time: 1100, courseId: 'c1', courseName: 'Mt. SAC' },
    { raceId: 'r2', raceName: 'B', date: '2025-10-01', time: 1050, courseId: 'c1', courseName: 'Mt. SAC' },
    { raceId: 'r3', raceName: 'C', date: '2025-09-10', time: 1200, courseId: 'c2', courseName: 'Woodward Park' }, // raced once, excluded
  ];
  const courseBests = computeCourseBests(results);
  assert.equal(courseBests.length, 1);
  assert.equal(courseBests[0].courseId, 'c1');
  assert.equal(courseBests[0].raceCount, 2);
  assert.equal(courseBests[0].bestTimeSec, 1050);
  assert.equal(courseBests[0].worstTimeSec, 1100);
  assert.equal(courseBests[0].deltaSec, 50);
});

test('computeCourseBests: results missing a courseId are ignored entirely', () => {
  const results = [
    { raceId: 'r1', raceName: 'A', date: '2025-09-01', time: 1100, courseId: null, courseName: null },
    { raceId: 'r2', raceName: 'B', date: '2025-09-08', time: 1090, courseId: null, courseName: null },
  ];
  assert.deepEqual(computeCourseBests(results), []);
});

test('computePRs: one PR per distinct distance, distances rounded to absorb float noise', () => {
  const results = [
    { raceId: 'r1', raceName: '5K Opener', date: '2025-09-01', time: 1200, distanceMeters: 5000 },
    { raceId: 'r2', raceName: '5K Late', date: '2025-10-15', time: 1150, distanceMeters: 5000.0001 }, // same PR bucket
    { raceId: 'r3', raceName: '2 Mile', date: '2025-09-20', time: 700, distanceMeters: 3218.68 },
  ];
  const prs = computePRs(results);
  assert.equal(prs.length, 2);
  const fiveK = prs.find((p) => p.distanceMeters === 5000);
  assert.equal(fiveK.time, 1150);
  assert.equal(fiveK.raceId, 'r2');
});
