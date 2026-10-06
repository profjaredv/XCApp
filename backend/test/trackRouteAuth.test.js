// LeadPack Track & Field handoff: every route in routes/track.js is a
// temporary, build-time demo gate — the whole Track & Field surface is
// meant to be visible only to the platform super-admin allowlist until
// Jared's team gets real sport-scoped TeamMember permissions (Section 1b)
// or the gate is explicitly removed. Stricter than
// test/routeAuth.test.js's generic check on purpose: that one only looks
// at non-GET routes (an Express limitation — it can't see middleware
// applied via router.use()), but every route here, GET included, must
// never be reachable by a signed-in non-admin. A GET route added here
// later without requireSuperAdmin would pass the generic check silently;
// this test exists so it can't.
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../routes/track');

function collectRouteMiddlewareNames(routeLayer) {
  return routeLayer.stack.map((layer) => layer.name).filter(Boolean);
}

test('every route in routes/track.js requires authenticate and requireSuperAdmin', () => {
  const failures = [];

  for (const layer of router.stack) {
    if (!layer.route) continue;

    const routePath = layer.route.path;
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    const handlerNames = collectRouteMiddlewareNames(layer.route);

    for (const method of methods) {
      const hasAuthenticate = handlerNames.includes('authenticate');
      const hasSuperAdminGuard = handlerNames.includes('requireSuperAdmin');
      if (!hasAuthenticate || !hasSuperAdminGuard) {
        failures.push(`${method.toUpperCase()} ${routePath} — middleware: [${handlerNames.join(', ')}]`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Every /api/track route must carry both authenticate and requireSuperAdmin:\n${failures.join('\n')}`
  );
});

test('routes/track.js is mounted at /api/track in server.js, gated the same way', () => {
  const serverSrc = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSrc, /app\.use\('\/api\/track',\s*trackRoutes\)/);
});
