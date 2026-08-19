// Permission-related (rule 4: write the test before the fix). Workstream F
// (LeadPack Master Build Handoff) closes the open POST /api/teams hole and
// replaces it with an admin-issued claim link. Source inspection, matching
// the style already established in captainPermissions.test.js and
// routeAuth.test.js — this repo has no live-request/integration harness.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TEAMS_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'teams.js');
const TEAM_CLAIMS_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'teamClaims.js');
const TEAM_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'team.js');
const ATHLETES_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'athletes.js');

test('F2: routes/teams.js no longer exposes a public POST / — team creation is admin-only', () => {
  const source = fs.readFileSync(TEAMS_ROUTE_PATH, 'utf8');
  assert.doesNotMatch(
    source,
    /router\.post\(\s*['"]\/['"]/,
    'routes/teams.js still has a public POST / — this is the exact global-namespace, first-come-first-served hole F2 closes'
  );
});

test('F3: GET /api/team-claims/:token never returns the raw claim email, only a masked version', () => {
  const source = fs.readFileSync(TEAM_CLAIMS_ROUTE_PATH, 'utf8');
  const routeStart = source.indexOf("router.get('/:token'");
  assert.ok(routeStart !== -1, 'GET /:token handler not found');
  const getSection = source.slice(routeStart, source.indexOf("router.post", routeStart));

  assert.match(getSection, /maskEmail\(claim\.email\)/, 'GET /:token never masks the email before returning it');
  assert.doesNotMatch(
    getSection,
    /email:\s*claim\.email[^)]/,
    'GET /:token appears to return the raw claim.email unmasked'
  );
});

test('F3: POST /api/team-claims/:token/claim never compares the signed-in account\'s email against claim.email', () => {
  const source = fs.readFileSync(TEAM_CLAIMS_ROUTE_PATH, 'utf8');
  const routeStart = source.indexOf("router.post('/:token/claim'");
  assert.ok(routeStart !== -1, 'POST /:token/claim handler not found');
  const claimSection = source.slice(routeStart);

  // The whole point of F3: the link is the credential. Requiring an exact
  // email match would mean building email-ownership verification, which is
  // the exact infrastructure this design avoids.
  assert.doesNotMatch(
    claimSection,
    /req\.user\.email\s*(===|!==)\s*claim\.email/,
    'claim route compares the account email against claim.email — F3 explicitly forbids this'
  );
  assert.match(claimSection, /role:\s*'HEAD_COACH'/, 'successful claim never grants HEAD_COACH');
  assert.match(claimSection, /status\(404\)/, 'claim route has no 404 path for an invalid/already-claimed token');
  assert.match(claimSection, /status\(410\)/, 'claim route has no 410 path for an expired token');
});

test('F4: join code generation, staff invite, and guardian-link approval all require an active plan', () => {
  const source = fs.readFileSync(TEAM_ROUTE_PATH, 'utf8');
  assert.match(source, /require\(['"]\.\.\/lib\/entitlements['"]\)/, 'routes/team.js does not import requireActivePlan');

  for (const marker of ["router.post('/generate-join-code'", "router.post('/staff-invite'", "router.post('/approve-guardian-link'"]) {
    const start = source.indexOf(marker);
    assert.ok(start !== -1, `route handler not found: ${marker}`);
    const line = source.slice(start, source.indexOf('\n', start));
    assert.match(line, /requireActivePlan/, `${marker} is not gated by requireActivePlan`);
  }
});

test('F4: athlete invites require an active plan', () => {
  const source = fs.readFileSync(ATHLETES_ROUTE_PATH, 'utf8');
  assert.match(source, /require\(['"]\.\.\/lib\/entitlements['"]\)/, 'routes/athletes.js does not import requireActivePlan');

  const start = source.indexOf("router.post('/:athleteId/invite'");
  assert.ok(start !== -1, 'athlete invite route handler not found');
  const line = source.slice(start, source.indexOf('\n', start));
  assert.match(line, /requireActivePlan/, 'athlete invite route is not gated by requireActivePlan');
});
