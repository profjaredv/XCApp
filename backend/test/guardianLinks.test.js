// Guards on parent access.
//
// What went wrong live: a parent signed up, asked to follow their athlete,
// and the request went to the PLATFORM queue (POST /team-requests,
// super-admin only). The coach never saw it, and the only action the super
// admin had was "create a team" — nonsense for a parent.
//
// A parent following their child is a coach's decision. GuardianLink and
// POST /team/approve-guardian-link already existed; what was missing was
// anything that listed the requests, and a sign-up path that filed them.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
/** Comments in these files name the very things the assertions forbid. */
const code = (...p) =>
  read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

const GUARDIAN = code('backend', 'routes', 'guardian.js');
const TEAM = code('backend', 'routes', 'team.js');
const ONBOARDING = code('web', 'src', 'pages', 'OnboardingPage.tsx');
const SCHEMA = read('backend', 'prisma', 'schema.prisma');
const ROSTER = read('web', 'src', 'pages', 'RosterPage.tsx');

test('a parent request never goes to the platform queue', () => {
  // The exact defect. /team-requests is super-admin-only and its approve
  // action creates a team.
  const parentStep = ONBOARDING.slice(
    ONBOARDING.indexOf("const handleGuardianRequest"),
    ONBOARDING.indexOf('const submitRequest')
  );
  assert.ok(parentStep.length > 0, 'the guardian handler should exist');
  assert.match(parentStep, /requestGuardianLinks/);
  assert.doesNotMatch(parentStep, /team-requests/, 'a parent link is not a platform request');
});

test('one parent can request several children at once', () => {
  // A family with two runners on one team is ordinary, not an edge case.
  assert.match(GUARDIAN, /athleteIds/);
  assert.match(GUARDIAN, /Array\.isArray\(req\.body\?\.athleteIds\)/);
  // The singular form still works — older clients post it.
  assert.match(GUARDIAN, /req\.body\?\.athleteId/);
});

test('the schema allows many children per guardian, one row each', () => {
  const block = SCHEMA.match(/^model GuardianLink \{([\s\S]*?)^\}/m)[1];
  // Unique on the PAIR, not on the user — a second child must be allowed.
  assert.match(block, /@@unique\(\[userId, athleteId\]\)/);
  assert.doesNotMatch(block, /userId\s+String\s+@unique/, 'a guardian is not limited to one athlete');
});

test('every requested athlete is verified against the code’s own team', () => {
  // Without this a parent holding one team's code could file links
  // against another team's roster by posting ids from it.
  assert.match(
    GUARDIAN,
    /where: \{ id: \{ in: ids \}, teamId: team\.id \}/,
    'athlete ids must be scoped to the team the join code belongs to'
  );
});

test('the lookup grants nothing', () => {
  const lookup = GUARDIAN.slice(
    GUARDIAN.indexOf("router.post('/lookup'"),
    GUARDIAN.indexOf("router.post('/request-link'")
  );
  assert.ok(lookup.length > 0);
  for (const write of ['create', 'update', 'upsert', 'delete']) {
    assert.doesNotMatch(lookup, new RegExp(`\\.${write}\\(`), `lookup must not ${write}`);
  }
  // Specifically not via /team/join, which would make a parent an ATHLETE.
  assert.doesNotMatch(lookup, /teamMember/);
});

test('a coach can actually see the queue', () => {
  // Its absence was the bug: approve existed, listing did not, so requests
  // sat pending forever with nobody told.
  assert.match(TEAM, /router\.get\('\/guardian-links',\s*authenticate,\s*requireTeam,\s*requireRole\(FULL_COACH\)/);
  // Scoped by the ATHLETE's team — a guardian belongs to no team, so that
  // is the only thing tying a request to the coach who may answer it.
  assert.match(TEAM, /status,\s*athlete: \{ teamId: req\.user\.teamId \}/);
  assert.match(ROSTER, /PendingGuardianLinksCard/, 'the card must be mounted for coaches');
});

test('approval stays per child', () => {
  // A coach might know one family relationship and not the other.
  assert.match(TEAM, /linkId, action/);
  assert.doesNotMatch(TEAM, /linkIds/, 'approving in bulk would remove that choice');
});

// --- parents who never had a join code -------------------------------------
//
// The live failure: a parent signed up, searched for her school, named her
// child, and the request landed in the PLATFORM queue. The super admin
// could only decline it; the coach who should decide never learned it
// existed; the parent heard nothing. The guardian flow keys on the join
// code, which she did not have.

test('the coach can see parent requests aimed at their own team', () => {
  assert.match(
    TEAM,
    /router\.get\('\/parent-requests',\s*authenticate,\s*requireTeam,\s*requireRole\(FULL_COACH\)/
  );
  // wantsTeamId is what ties a platform request to a coach who may answer
  // it — a parent belongs to no team, so nothing else does.
  assert.match(TEAM, /role: 'parent', status: 'pending', wantsTeamId: req\.user\.teamId/);
});

test('linking scopes athlete ids to the coach’s own team', () => {
  // Without this a body-supplied id from another team could create a link.
  const link = TEAM.slice(
    TEAM.indexOf("router.post('/parent-requests/:id/link'"),
    TEAM.indexOf("router.post('/parent-requests/:id/decline'")
  );
  assert.ok(link.length > 0);
  assert.match(link, /where: \{ id: \{ in: ids \}, teamId: req\.user\.teamId \}/);
});

test('linking creates the guardian link already approved', () => {
  // The coach naming the athlete IS the approval. Leaving it pending would
  // make the same coach answer the same question twice, on a second queue.
  const link = TEAM.slice(
    TEAM.indexOf("router.post('/parent-requests/:id/link'"),
    TEAM.indexOf("router.post('/parent-requests/:id/decline'")
  );
  assert.match(link, /status: 'approved'/);
  assert.match(link, /guardianLink\.upsert/);
  // Link and request resolution share a transaction: a link created
  // against a request still showing pending would be actioned twice.
  assert.match(link, /prisma\.\$transaction/);
  assert.match(link, /teamRequest\.update/);
});

test('one parent can be linked to several children here too', () => {
  const link = TEAM.slice(TEAM.indexOf("router.post('/parent-requests/:id/link'"));
  assert.match(link, /athleteIds/);
  assert.match(link, /athletes\.map/);
});

test('the platform dashboard no longer sends coaches to a page that was renamed', () => {
  // The instruction said "the Athletes page" after that nav entry became
  // "Roster" — a stale pointer created by the rename itself.
  const ADMIN_PAGE = read('web', 'src', 'pages', 'AdminDashboardPage.tsx');
  assert.doesNotMatch(ADMIN_PAGE, /Athletes page/);
});
