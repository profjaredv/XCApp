// The team role policy, enforced across every route at once.
//
// The policy: a COACH is equal to a HEAD_COACH except for deleting data.
// Before this it was spelled out route by route and the two roles had
// quietly drifted apart in thirteen places — coaches could not edit team
// settings, start a season, save pace zones, export, or manage staff, and
// nothing said so in one place. Coaches noticed as "I don't have the menus
// you do."
//
// This test is what stops that happening again: it reads every route file,
// and fails if a gate is written as a literal array instead of one of the
// named sets, or if a head-coach-only route is not on the destructive list.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { FULL_COACH, DESTRUCTIVE, ANY_COACH, ANY_TEAM_MEMBER } = require('../lib/teamRoles');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const FILES = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'));

function gatesIn(file) {
  const source = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
  const out = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']*)'([^\n]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const gate = /requireRole\(([A-Za-z_[][^)]*)\)/.exec(m[3]);
    out.push({
      file,
      method: m[1].toUpperCase(),
      path: m[2],
      gate: gate ? gate[1].trim() : null,
      line: m[3],
    });
  }
  return out;
}

const ALL = FILES.flatMap(gatesIn);
const GATED = ALL.filter((r) => r.gate !== null);

// The complete list of what a head coach can do that a coach cannot. This
// IS the policy exception — deleting data — written out. Adding a route
// here is a deliberate decision; the test makes it impossible to add one by
// accident.
const DESTRUCTIVE_ROUTES = [
  'athletes.js DELETE /:athleteId',
  'athletes.js POST /merge',
  'dataManagement.js POST /clear/:season',
  'seasons.js DELETE /:id/results',
  'teams.js DELETE /:athleticTeamId/results',
];

const id = (r) => `${r.file} ${r.method} ${r.path}`;

test('every role gate uses a named set, never a literal array', () => {
  // A literal is how the policy came apart last time: it reads fine on its
  // own line and is invisible in aggregate.
  const literals = GATED.filter((r) => r.gate.startsWith('['));
  assert.deepEqual(
    literals.map(id),
    [],
    `these gates use literal arrays instead of lib/teamRoles.js: ${literals.map(id).join(', ')}`
  );
});

test('every gate names a set that actually exists', () => {
  const known = new Set(['FULL_COACH', 'DESTRUCTIVE', 'ANY_COACH', 'ANY_TEAM_MEMBER']);
  for (const r of GATED) {
    assert.ok(known.has(r.gate), `${id(r)} uses unknown role set "${r.gate}"`);
  }
});

test('head-coach-only means deleting data, and nothing else', () => {
  const restricted = GATED.filter((r) => r.gate === 'DESTRUCTIVE').map(id).sort();
  assert.deepEqual(
    restricted,
    [...DESTRUCTIVE_ROUTES].sort(),
    'a route became head-coach-only without being a data deletion — that breaks "coach equals head coach except deleting data"'
  );
});

test('the sets themselves say what the policy says', () => {
  assert.deepEqual(FULL_COACH, ['HEAD_COACH', 'COACH'], 'coach is equal to head coach');
  assert.deepEqual(DESTRUCTIVE, ['HEAD_COACH'], 'only deleting data is head-coach-only');
  assert.ok(!FULL_COACH.includes('VOLUNTEER_COACH'), 'volunteers are not full coaches');
  assert.ok(ANY_COACH.includes('VOLUNTEER_COACH'));
});

test('anything a head coach can reach, a coach can reach too — except deletion', () => {
  // The property the product owner actually asked for, checked directly
  // rather than inferred from the sets.
  const forHeadCoach = GATED.filter((r) => {
    const set = { FULL_COACH, DESTRUCTIVE, ANY_COACH, ANY_TEAM_MEMBER }[r.gate];
    return set.includes('HEAD_COACH');
  });
  const coachCannot = forHeadCoach.filter((r) => {
    const set = { FULL_COACH, DESTRUCTIVE, ANY_COACH, ANY_TEAM_MEMBER }[r.gate];
    return !set.includes('COACH');
  });
  assert.deepEqual(coachCannot.map(id).sort(), [...DESTRUCTIVE_ROUTES].sort());
});

// The only writes a volunteer coach may do team-wide, rather than only in
// a group they lead. Both are field capture: someone supervising a session
// has to be able to record what happened at it, and a volunteer running a
// workout needs the same access as a paid coach for that hour. Everything
// else a volunteer writes is group-scoped inside a handler.
const VOLUNTEER_WRITE_ROUTES = [
  'attendance.js POST /',
  'attendance.js POST /:sessionId/records',
  'attendance.js PATCH /:sessionId',
  'attendance.js PATCH /:sessionId/records/:athleteId',
  'attendance.js DELETE /:sessionId',
  'attendance.js DELETE /:sessionId/records/:athleteId',
  'intervalSessions.js POST /',
  'intervalSessions.js POST /:id/duplicate',
  'intervalSessions.js POST /:id/entries',
  'intervalSessions.js PUT /:id',
  'intervalSessions.js PUT /entries/:entryId',
  'intervalSessions.js DELETE /:id',
  'intervalSessions.js DELETE /entries/:entryId',
];

test('volunteers get team-wide write access only where it is intended', () => {
  // Volunteers are not full coaches — their write access is normally
  // scoped to the groups they lead, decided inside a handler. A new
  // non-GET route on ANY_COACH would hand every volunteer team-wide write
  // access by accident, so each one has to be listed deliberately.
  const writes = GATED.filter((r) => r.gate === 'ANY_COACH' && r.method !== 'GET').map(id).sort();
  assert.deepEqual(
    writes,
    [...VOLUNTEER_WRITE_ROUTES].sort(),
    'a route gave volunteers team-wide write access without being listed as intended'
  );
});

test('the audit covers a realistic number of routes', () => {
  // Guards the regex: if it silently stops matching, every assertion above
  // passes vacuously.
  assert.ok(GATED.length > 60, `only parsed ${GATED.length} gated routes — the matcher is probably broken`);
});
