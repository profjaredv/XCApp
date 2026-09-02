// The group day view — one group on one afternoon.
//
// The rule this file exists to hold: attendance is NOT scoped to a group.
// A team takes attendance once per day (AttendanceSession is unique per
// team+season+date) and this screen filters that one session down to a
// group's members. Scoping it per group would let two squads practising at
// the same time record contradictory answers about the same athlete.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const groupsSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'groups.js'), 'utf8');
const intervalSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'intervalSessions.js'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

/** Comments here describe the very things the assertions forbid. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

const dayRoute = code(groupsSource).slice(
  code(groupsSource).indexOf("router.get('/:id/day'"),
  code(groupsSource).indexOf("router.get('/:id/trend'")
);

test('the day route exists and is coach-tier', () => {
  assert.ok(dayRoute.length > 0, 'GET /:id/day is missing');
  assert.match(dayRoute, /authenticate, requireTeam, requireRole\(ANY_COACH\)/);
});

test('attendance stays one session per team per day', () => {
  // If this constraint ever gains a groupId, the day view's whole premise
  // changes and this file should be revisited deliberately.
  assert.match(schema, /@@unique\(\[teamId, seasonId, date\]\)/);
  assert.ok(
    !/model AttendanceSession[\s\S]*?groupId[\s\S]*?@@map\("attendance_sessions"\)/.test(schema),
    'AttendanceSession must not be scoped to a group'
  );
});

test('the day view reads the team session rather than creating one', () => {
  // Opening a screen must not write attendance rows for the whole team.
  assert.match(dayRoute, /attendanceSession\.findUnique/);
  assert.ok(!dayRoute.includes('attendanceSession.create'), 'the view must not create a session as a side effect');
});

test('a team with attendance off still gets the roster and last times', () => {
  assert.match(dayRoute, /isFeatureEnabled\([^)]*'attendance'\)/);
  assert.match(dayRoute, /attendanceEnabled/);
});

test('grade is derived, never assumed from a stored column', () => {
  assert.match(dayRoute, /deriveGrade\(/);
});

test('an athlete with no attendance row reads as unmarked, not absent', () => {
  // "Nobody has taken attendance" and "marked absent" are different
  // answers to what a coach is looking at.
  assert.match(dayRoute, /statusByAthlete\.has\(athleteId\) \? statusByAthlete\.get\(athleteId\) : null/);
  assert.match(dayRoute, /counts\.unmarked/);
});

test('an interval session can be built for a group from a subset of its athletes', () => {
  // A sheet made from who actually turned up still belongs to the group —
  // it just skips blank rows for the athletes who are home sick.
  const create = code(intervalSource).slice(
    code(intervalSource).indexOf("router.post('/',"),
    code(intervalSource).indexOf("router.post('/:id/duplicate'")
  );
  assert.match(create, /if \(Array\.isArray\(athleteIds\)\)/);
  assert.match(create, /groupId: groupId \|\| null/);
  // Whatever list arrives is still checked against the team.
  assert.match(create, /validCount !== ids\.length/);
});
