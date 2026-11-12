const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildFootsteps, bestPaceByGrade } = require('../lib/footsteps');

const MILE = 1609.34;
const fiveKAt = (pace) => (pace * 5000) / MILE; // seconds for a 5K at this pace
// Season in which an athlete of this class is in this grade.
const seasonFor = (gradYear, grade) => gradYear - 13 + grade;

function runner(id, gradYear, pacesByGrade, name = `Runner ${id}`) {
  return {
    athlete: { id, name, graduationYear: gradYear },
    results: Object.entries(pacesByGrade).map(([grade, pace]) => ({
      athleteId: id, season: seasonFor(gradYear, Number(grade)), timeSec: fiveKAt(pace), distanceMeters: 5000,
    })),
  };
}
function build(target, others, opts = {}) {
  const all = [target, ...others];
  return buildFootsteps({ athleteId: target.athlete.id, athletes: all.map((r) => r.athlete), results: all.flatMap((r) => r.results), ...opts });
}

test('footsteps: uses only races near 5K, at each athlete’s season best', () => {
  const athletes = [{ id: 'a', graduationYear: 2027 }];
  const results = [
    { athleteId: 'a', season: 2024, timeSec: 360, distanceMeters: 1609 }, // mile time trial: ignored
    { athleteId: 'a', season: 2024, timeSec: fiveKAt(420), distanceMeters: 5000 },
    { athleteId: 'a', season: 2024, timeSec: fiveKAt(410), distanceMeters: 5000 },
  ];
  const paces = bestPaceByGrade(athletes, results);
  assert.equal(Math.round(paces.get('a').get(10)), 410);
});

test('footsteps: projects from what matched alumni actually gained', () => {
  const me = runner('me', 2028, { 9: 430, 10: 420 });
  const alumni = [
    runner('a1', 2022, { 10: 418, 11: 404, 12: 396 }),
    runner('a2', 2023, { 10: 424, 11: 410, 12: 400 }),
    runner('a3', 2024, { 10: 421, 11: 409, 12: 399 }),
    runner('far', 2022, { 10: 360, 11: 350, 12: 345 }), // far too fast to be a match
    runner('nofuture', 2029, { 10: 420 }),              // no later season yet
  ];
  const out = build(me, alumni, { showNames: true });
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.matches.map((m) => m.athleteId).sort(), ['a1', 'a2', 'a3']);
  assert.equal(out.projection.length, 2);
  const senior = out.projection[1];
  assert.equal(senior.grade, 12);
  assert.equal(senior.basedOn, 3);
  assert.equal(senior.improved, 3);
  // Deltas at 12th: -22, -24, -22 -> median -22 -> 398 pace.
  assert.equal(senior.fiveKSec, Math.round((398 * 5000) / MILE));
  assert.ok(senior.fastestFiveKSec < senior.fiveKSec && senior.fiveKSec <= senior.slowestFiveKSec);
  assert.equal(out.summary.improvedCount, 3);
});

test('footsteps: no projection from fewer than three matches', () => {
  const me = runner('me', 2028, { 10: 420 });
  const out = build(me, [runner('a1', 2022, { 10: 421, 11: 410 }), runner('a2', 2023, { 10: 419, 11: 409 })]);
  assert.equal(out.status, 'few-matches');
  assert.equal(out.matches.length, 2);
  assert.deepEqual(out.projection, []);
});

test('footsteps: an athlete or guardian never gets another student’s name or id', () => {
  const me = runner('me', 2028, { 10: 420 });
  const alumni = ['a1', 'a2', 'a3'].map((id, i) => runner(id, 2022 + i, { 10: 420 + i, 11: 408 }, `Secret Name ${id}`));
  const out = build(me, alumni, { showNames: false });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /Secret Name/);
  assert.doesNotMatch(json, /"athleteId"/);
  assert.equal(out.matches[0].label.startsWith('Class of '), true);
});

test('footsteps: says why when there is nothing to show', () => {
  const me = runner('me', 2028, { 10: 420 });
  assert.equal(build(me, []).status, 'no-matches');
  assert.equal(build(runner('sr', 2027, { 12: 400 }), []).status, 'final-year');
  const noYear = { athlete: { id: 'x', name: 'X', graduationYear: null }, results: [] };
  assert.equal(build(noYear, []).status, 'no-class-year');
  const noRaces = { athlete: { id: 'y', name: 'Y', graduationYear: 2028 }, results: [] };
  assert.equal(build(noRaces, []).status, 'no-races');
});

test('footsteps: the same input gives the same matches in the same order', () => {
  const me = runner('me', 2028, { 10: 420 });
  const alumni = ['c', 'a', 'b', 'd'].map((id) => runner(id, 2022, { 10: 420, 11: 410 }));
  const one = build(me, alumni).matches.map((m) => m.path);
  const two = build(me, [...alumni].reverse()).matches.map((m) => m.path);
  assert.deepEqual(one, two);
});

test('footsteps route: same permission as journey, names only for a coach', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'analytics.js'), 'utf8');
  const start = src.indexOf("router.get('/athlete/:athleteId/footsteps'");
  const route = src.slice(start, src.indexOf('\nrouter.get(', start + 10));
  assert.match(route, /decideCanViewAthleteJourney/);
  assert.match(route, /showNames: isTeamCoach && !isSelf/);
  assert.match(route, /teamId: athlete\.teamId/);
});
