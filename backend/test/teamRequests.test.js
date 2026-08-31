// Guards on team setup requests and the platform dashboard.
//
// The bug these exist to prevent recurring: a coach filled in "Get Your
// Team Set Up", saw a green "Sent", and nothing happened. The request was
// written as a Feedback row with severity 'blocker' — POST /feedback sends
// no mail, so nobody was told, and the row had no status anyone could act
// on. It was discoverable only by scrolling the feedback list.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const BACKEND = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(BACKEND, 'routes', 'admin.js'), 'utf8');
const REQUESTS = fs.readFileSync(path.join(BACKEND, 'routes', 'teamRequests.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
const ONBOARDING = fs.readFileSync(
  path.join(BACKEND, '..', 'web', 'src', 'pages', 'OnboardingPage.tsx'),
  'utf8'
);

test('the onboarding form no longer files a request as feedback', () => {
  assert.match(ONBOARDING, /post\('\/team-requests'/, 'must post to the real endpoint');
  assert.doesNotMatch(
    ONBOARDING,
    /post\('\/feedback'[\s\S]{0,200}severity: 'blocker'/,
    'a team request must not be filed as a blocker-severity Feedback row'
  );
});

test('a request is a real record with a status that can be actioned', () => {
  const block = SCHEMA.match(/^model TeamRequest \{([\s\S]*?)^\}/m);
  assert.ok(block, 'TeamRequest must exist');
  for (const field of ['status', 'resolvedAt', 'resolvedById', 'createdTeamId']) {
    assert.match(block[1], new RegExp(`\\b${field}\\b`), `TeamRequest needs ${field}`);
  }
});

test('anyone signed in can file a request; only an admin can see or action one', () => {
  // The request endpoint must NOT be admin-gated — the whole point is
  // that a coach with no team reaches it.
  assert.match(REQUESTS, /router\.post\('\/',\s*authenticate,/);
  assert.doesNotMatch(REQUESTS, /requireSuperAdmin/, 'filing a request is not an admin action');
  assert.match(SERVER, /app\.use\('\/api\/team-requests', teamRequestRoutes\)/);

  // Every dashboard and action route is admin-gated.
  const adminRoutes = [...ADMIN.matchAll(/router\.(get|post)\('([^']+)'([^)]*)/g)];
  assert.ok(adminRoutes.length >= 6, 'expected the admin routes to be found');
  for (const [, , routePath, rest] of adminRoutes) {
    assert.match(rest, /requireSuperAdmin/, `/admin${routePath} must require a super admin`);
  }
});

test('a duplicate request updates the open one instead of stacking rows', () => {
  // A coach who hears nothing will submit again. Two rows for one team is
  // a queue the admin has to reconcile by hand.
  assert.match(REQUESTS, /findFirst\(\{\s*where: \{ userId: req\.user\.id, status: 'pending' \}/);
  assert.match(REQUESTS, /prisma\.teamRequest\.update/);
});

test('approving creates the team and closes the request atomically', () => {
  // A team created without its request closed shows as still pending and
  // gets approved a second time, producing a duplicate team.
  const approve = ADMIN.slice(
    ADMIN.indexOf("router.post('/team-requests/:id/approve'"),
    ADMIN.indexOf("router.post('/team-requests/:id/decline'")
  );
  assert.ok(approve.length > 0);
  assert.match(approve, /prisma\.\$transaction/, 'team creation and request resolution must share a transaction');
  assert.match(approve, /tx\.team\.create/);
  assert.match(approve, /tx\.teamRequest\.update/);
  assert.match(approve, /status: 'approved'/);
});

test('a request cannot be approved or declined twice', () => {
  const approvals = [...ADMIN.matchAll(/This request was already \$\{request\.status\}/g)];
  assert.equal(approvals.length, 2, 'both approve and decline must reject an already-resolved request');
});

test('the claim link comes back even when the email fails', () => {
  // The original failure mode was silent: mail not configured, nobody
  // told, team unreachable. The admin must always be able to send the
  // link by hand.
  const approve = ADMIN.slice(ADMIN.indexOf("router.post('/team-requests/:id/approve'"));
  assert.match(approve, /emailSent = false/);
  assert.match(approve, /claimLink,\s*\n\s*emailSent,/, 'the response must carry the link and whether mail went out');
});

test('declining does not email the requester', () => {
  const decline = ADMIN.slice(
    ADMIN.indexOf("router.post('/team-requests/:id/decline'"),
    ADMIN.indexOf('module.exports')
  );
  // "Declined" is usually "duplicate" or "already set up by hand"; an
  // automatic rejection email would be wrong in both cases.
  assert.doesNotMatch(decline, /sendEmail/);
});
