// Guards on the reordered sign-up flow.
//
// The defects these lock down, all found by tracing the four real cases:
//
//   1. An assistant coach joining a team that already existed matched
//      neither onboarding option, so they used the athlete join code and
//      POST /profile/join-team silently made them an ATHLETE. That is why
//      "coaches with role=coach" had no coach menus.
//   2. Onboarding's join called /profile/join-team, which does not return
//      unclaimed roster rows — so an athlete joined the team but was never
//      linked to their own results. The page that does it properly was
//      only reachable from a screen you need a team to see.
//   3. Nothing ever asked which team. It arrived as prose in a textarea.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Source with comments removed.
 *
 *  These files explain themselves at length, and several of those comments
 *  name the very things the assertions forbid — "not /profile/join-team",
 *  "no join code or email is reachable here". Matching raw text flagged
 *  the prose describing the fix as if it were the bug. Asserting against
 *  code only is also simply the stronger check. */
const code = (...p) =>
  read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

const ONBOARDING = code('web', 'src', 'pages', 'OnboardingPage.tsx');
const START = code('web', 'src', 'pages', 'StartPage.tsx');
const DIRECTORY = code('backend', 'routes', 'teamDirectory.js');
const REQUESTS = code('backend', 'routes', 'teamRequests.js');
const SERVER = code('backend', 'server.js');
const SCHEMA = read('backend', 'prisma', 'schema.prisma');

test('onboarding joins through the endpoint that offers a roster profile', () => {
  assert.match(ONBOARDING, /teamService\.joinTeam/, 'must use POST /team/join');
  assert.doesNotMatch(
    ONBOARDING,
    /profile\/join-team/,
    '/profile/join-team returns no availableProfiles — an athlete joined by it is never linked to their results'
  );
  assert.match(ONBOARDING, /claimProfile/, 'the claim step must exist');
});

test('a coach whose team exists is sent to staff access, never to a join code', () => {
  // The whole bug: a join code makes you an ATHLETE.
  assert.match(ONBOARDING, /'staff-access'/);
  assert.match(
    ONBOARDING,
    /setStep\(stored\.teamId \? 'staff-access' : 'request'\)/,
    'a coach with a known team must land on staff access'
  );
});

test('the fallback fork offers the option that was missing', () => {
  assert.match(
    ONBOARDING,
    /I'm a coach and my team is already here/,
    'without this an assistant coach has no correct option'
  );
});

test('role and team are asked before the account is created', () => {
  // StartPage must not require a signed-in user — that is the ordering fix.
  assert.doesNotMatch(START, /requireAuth|useAuth\(\)/, 'the wizard runs before sign-in');
  assert.match(START, /saveIntent\(/);
  assert.match(START, /navigate\(`\/\$\{target\}`\)/, 'it hands off to auth after asking');
});

test('the request carries a structured role and team, not just prose', () => {
  assert.match(REQUESTS, /VALID_ROLES/);
  assert.match(REQUESTS, /teamName/);
  const block = SCHEMA.match(/^model TeamRequest \{([\s\S]*?)^\}/m)[1];
  for (const field of ['role', 'teamName', 'wantsTeamId']) {
    assert.match(block, new RegExp(`\\b${field}\\b`), `TeamRequest needs ${field}`);
  }
});

test('wantsTeamId is verified server-side, never trusted from the body', () => {
  // A bad id would otherwise sit in the admin queue pointing at nothing.
  assert.match(
    REQUESTS,
    /prisma\.team\.findUnique\(\{\s*where: \{ id: req\.body\.wantsTeamId \}/,
    'the team must be looked up before being stored'
  );
});

test('the team directory exposes no credential and no student data', () => {
  // It is the only unauthenticated database read in the app.
  assert.doesNotMatch(DIRECTORY, /joinCode/, 'the join code is a bearer credential');
  for (const forbidden of ['email', 'athlete', 'Athlete', 'user:']) {
    assert.doesNotMatch(DIRECTORY, new RegExp(forbidden), `directory must not reach ${forbidden}`);
  }
  // Only a boolean about the head coach, never who they are.
  assert.match(DIRECTORY, /hasHeadCoach: team\.members\.length > 0/);
});

test('the directory refuses enumeration', () => {
  assert.match(DIRECTORY, /MIN_QUERY = 3/);
  assert.match(DIRECTORY, /q\.length < MIN_QUERY/);
  assert.match(DIRECTORY, /take: MAX_RESULTS/);
  assert.doesNotMatch(DIRECTORY, /cursor|skip:/, 'no pagination — the list must not be walkable');
  assert.match(SERVER, /app\.use\('\/api\/team-directory', directoryLimiter\)/);
});

test('the directory selects explicit columns', () => {
  // Without a select, every column added to Team later becomes public.
  assert.match(DIRECTORY, /select: \{\s*\n\s*id: true/);
});
