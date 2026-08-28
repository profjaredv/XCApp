// Changing what "T" means changes every training pace handed to every
// athlete on the team, so writing the set is HEAD_COACH-only while reading
// it is open to anyone on the team (an athlete needs to know what their
// coach's abbreviations mean). Static, like routeAuth/feedbackAuth: it
// fails the build the moment a guard is loosened, with no database needed.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'paceZones.js'), 'utf8');
// Bounded by `async (req` rather than by the first `)`: the middleware
// list contains requireRole(['HEAD_COACH']), whose own parens would
// truncate a `[^)]*?` match and silently hide the PUT route from every
// assertion below.
const ROUTE_RE = /router\.(get|post|patch|put|delete)\(\s*'([^']*)'\s*,([\s\S]*?)async\s*\(req/g;

function declaredRoutes() {
  const out = [];
  let match;
  ROUTE_RE.lastIndex = 0;
  while ((match = ROUTE_RE.exec(SOURCE)) !== null) {
    out.push({ method: match[1].toUpperCase(), path: match[2], middleware: match[3] });
  }
  return out;
}

test('every pace-zone route authenticates and is scoped to a team', () => {
  const routes = declaredRoutes();
  assert.equal(routes.length, 2, `expected GET and PUT, parsed ${routes.length}`);
  for (const r of routes) {
    const id = `${r.method} ${r.path}`;
    assert.match(r.middleware, /authenticate/, `${id} must authenticate`);
    assert.match(r.middleware, /requireTeam/, `${id} must be team-scoped`);
  }
});

test('writing the set is limited to real coaches, not volunteers', () => {
  // Was head-coach-only. Opened to COACH under lib/teamRoles.js's policy —
  // defining what "T" means is coaching, not data deletion. Still closed to
  // volunteers, whose write access is scoped to the groups they lead.
  for (const r of declaredRoutes().filter((x) => x.method !== 'GET')) {
    assert.match(r.middleware, /requireRole\(FULL_COACH\)/, `${r.method} ${r.path}`);
    assert.doesNotMatch(r.middleware, /ANY_COACH/, `${r.method} ${r.path}`);
  }
});

test('no route accepts a team id from the request', () => {
  // req.user.teamId is the only permitted source (see middleware/auth.js).
  assert.doesNotMatch(SOURCE, /req\.(params|body|query)\.teamId/);
});
