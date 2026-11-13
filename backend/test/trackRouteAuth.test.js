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

test('only the import writes, and it takes a full coach', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'routes', 'track.js'), 'utf8');
  const writes = src.match(/router\.(post|put|patch|delete)\([^\n]*/g) || [];
  assert.equal(writes.length, 1);
  assert.match(writes[0], /requireRole\(FULL_COACH\)/);
  assert.doesNotMatch(src, /req\.(body|query|params)\.teamId/);
});

test('routes/track.js is mounted at /api/track in server.js', () => {
  const serverSrc = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSrc, /app\.use\('\/api\/track',\s*trackRoutes\)/);
});
