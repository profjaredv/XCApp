// Feedback is the product owner's private channel. Filing a report is open
// to anyone signed in; everything else — reading the queue, triaging it,
// exporting it — must be super-admin only.
//
// This exists because the read/triage/export routes were previously
// requireRole(['HEAD_COACH','COACH']) AND unscoped by team (the `mine=true`
// filter was opt-in), so any coach at any school could read and modify every
// other school's reports, reporter email addresses and raw console output
// included. routeAuth.test.js can't catch that: it only checks that non-GET
// routes carry *some* guard, and GET /, GET /export were both invisible to
// it. A static check is the right shape here for the same reason
// routeAuth.test.js is static — it fails the build the moment someone
// loosens a guard, with no database required.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'feedback.js'), 'utf8');

// router.get('/path', authenticate, requireSuperAdmin, ...)
const ROUTE_RE = /router\.(get|post|patch|put|delete)\(\s*'([^']*)'\s*,([^)]*?)async/g;

function declaredRoutes() {
  const out = [];
  let match;
  ROUTE_RE.lastIndex = 0;
  while ((match = ROUTE_RE.exec(SOURCE)) !== null) {
    const [, method, routePath, middleware] = match;
    out.push({ method: method.toUpperCase(), path: routePath, middleware });
  }
  return out;
}

test('every feedback route is declared with an explicit guard list', () => {
  const routes = declaredRoutes();
  assert.ok(routes.length >= 5, `expected to parse the feedback routes, found ${routes.length}`);
  for (const r of routes) {
    assert.match(r.middleware, /authenticate/, `${r.method} ${r.path} must authenticate`);
  }
});

test('only POST / is open to any signed-in user — everything else is super-admin only', () => {
  for (const route of declaredRoutes()) {
    const id = `${route.method} ${route.path}`;
    if (route.method === 'POST' && route.path === '/') {
      // Filing a report must stay open: a coach hitting a bug in the field
      // is exactly who needs it, and they are never a super admin.
      assert.doesNotMatch(route.middleware, /requireSuperAdmin/, `${id} should stay open to any signed-in user`);
      continue;
    }
    assert.match(route.middleware, /requireSuperAdmin/, `${id} must be super-admin only`);
  }
});

test('no feedback route is gated on a coach role — that was the cross-tenant leak', () => {
  for (const route of declaredRoutes()) {
    assert.doesNotMatch(
      route.middleware,
      /requireRole/,
      `${route.method} ${route.path} must not use requireRole: coach-role gating on this router let any coach read every team's reports`
    );
  }
});
