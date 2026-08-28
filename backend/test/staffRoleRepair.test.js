// Joining a team with the TEAM CODE always creates an ATHLETE membership
// (routes/team.js POST /join, routes/profile.js POST /join-team). A coach
// handed the join code instead of a staff invite therefore becomes an
// athlete at the team level — TeamMember.role is what every gate and the
// sidebar read, so they see a reduced menu while User.role still says
// 'coach'. That is the "my coaches don't have all the menu options" report.
//
// It was unfixable from the UI: GET /staff filtered ATHLETE rows out, so
// the person did not appear, and PATCH /staff/:userId 404'd on an ATHLETE
// membership. These pin both halves of the repair path open.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'team.js'), 'utf8');

function handler(marker) {
  const start = SOURCE.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return SOURCE.slice(start, SOURCE.indexOf('\n});', start));
}

test('the staff list also returns members who are not staff', () => {
  const get = handler("router.get('/staff'");
  assert.match(get, /role: 'ATHLETE'/, 'must query the non-staff members too');
  assert.match(get, /otherMembers:/, 'must return them so the UI can offer a promotion');
});

test('a member can be promoted out of ATHLETE', () => {
  const patch = handler("router.patch('/staff/:userId'");
  assert.doesNotMatch(
    patch,
    /membership\.role === 'ATHLETE'/,
    'refusing to touch an ATHLETE membership is what made a mis-roled coach unfixable'
  );
  assert.match(patch, /if \(!membership\)/, 'a genuinely missing membership must still 404');
});

test("the team owner cannot be demoted or deactivated", () => {
  // COACH can manage staff now, so without this a coach could strip the
  // head coach's access and lock the owner out of their own team.
  const patch = handler("router.patch('/staff/:userId'");
  assert.match(patch, /coachUid/, 'must look up who owns the team');
  assert.match(patch, /demoting/, 'must block a role change away from HEAD_COACH');
  assert.match(patch, /deactivating/, 'must block deactivation');
  assert.match(patch, /\.status\(409\)/, 'must refuse rather than silently ignore');
});

test('promoting the owner TO head coach is still allowed', () => {
  // The guard is about losing access, not about locking the row.
  const patch = handler("router.patch('/staff/:userId'");
  assert.match(patch, /role !== undefined && role !== 'HEAD_COACH'/);
});

test('joining by code still creates an ATHLETE, which is correct for that route', () => {
  // Not a bug to fix here: the join code is the athlete path. The bug was
  // that there was no way to correct it afterwards.
  const join = handler("router.post('/join'");
  assert.match(join, /role: 'ATHLETE'/);
  assert.match(join, /update: \{\}/, 'joining must never downgrade an existing staff membership');
});
