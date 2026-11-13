// Every route in routes/track.js, GET included, must carry the full gate:
// signed in, a coach on this team, Track & Field turned on for the team,
// and staff access that covers track. test/routeAuth.test.js only checks
// non-GET routes, and these GETs return athletes' results, so this is
// stricter on purpose.
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../routes/track');
const REQUIRED = ['authenticate', 'requireRole', 'featureGate', 'requireTrackSport'];

test('every route in routes/track.js carries the full track gate', () => {
  const failures = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const names = layer.route.stack.map((l) => l.name).filter(Boolean);
    const missing = REQUIRED.filter((n) => !names.includes(n));
    if (missing.length) failures.push(`${layer.route.path} is missing ${missing.join(', ')}`);
  }
  assert.deepEqual(failures, []);
  assert.ok(router.stack.filter((l) => l.route).length >= 7);
});

test('every write takes a full coach, and nothing trusts a team id from the request', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'track.js'), 'utf8');
  const writes = src.match(/router\.(post|put|patch|delete)\([^\n]*/g) || [];
  assert.ok(writes.length >= 8);
  for (const line of writes) assert.match(line, /requireRole\(FULL_COACH\)/, line);
  assert.doesNotMatch(src, /req\.(body|query|params)\.teamId/);
});

test('results cannot be thrown away through the meet or relay routes', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'track.js'), 'utf8');
  // A meet with results is refused; entries only ever delete ENTERED rows;
  // a relay with a time needs a head coach.
  assert.match(src, /This meet has results, so it cannot be removed/);
  assert.match(src, /r\.status === 'ENTERED' && !wanted\.includes/);
  assert.match(src, /row\.status !== 'ENTERED' && !\(await hasTeamRole\(req\.user, DESTRUCTIVE\)\)/);
});

test('the athlete route only ever reads the caller\'s own linked athlete', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'trackMe.js'), 'utf8');
  const routes = src.match(/router\.get\([^\n]*/g) || [];
  assert.equal(routes.length, 2);
  for (const line of routes) assert.match(line, /authenticate, requireTeam, requireFeature\('track'\), requireLinkedAthlete/);
  assert.doesNotMatch(src, /req\.(params|query|body)/);
  // Upcoming meets: only rows that are this athlete's own, or a relay they are on.
  assert.match(src, /OR: \[\{ athleteId: me\.id \}, \{ relayAthleteIds: \{ has: me\.id \} \}\]/);
});

test('routes/track.js is mounted at /api/track in server.js', () => {
  const serverSrc = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSrc, /app\.use\('\/api\/track',\s*trackRoutes\)/);
});
