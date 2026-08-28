// An export is the most concentrated pile of data the app can hand out, so
// who can ask for one is worth pinning statically — the same shape as
// feedbackAuth/paceZoneAuth, failing the build the moment a guard is
// loosened, with no database required.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'export.js'), 'utf8');
// Bounded by `async (req` rather than the first `)`, so requireRole([...])'s
// own parens cannot truncate a match and hide a route.
const ROUTE_RE = /router\.(get|post|patch|put|delete)\(\s*'([^']*)'\s*,([\s\S]*?)async\s*\(req/g;

function declaredRoutes() {
  const out = [];
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(SOURCE)) !== null) {
    out.push({ method: m[1].toUpperCase(), path: m[2], middleware: m[3] });
  }
  return out;
}

test('every export route authenticates and is team-scoped', () => {
  const routes = declaredRoutes();
  assert.equal(routes.length, 3, `expected 3 export routes, parsed ${routes.length}`);
  for (const r of routes) {
    const id = `${r.method} ${r.path}`;
    assert.match(r.middleware, /authenticate/, `${id} must authenticate`);
    assert.match(r.middleware, /requireTeam/, `${id} must be team-scoped`);
  }
});

test('the whole-team export is HEAD_COACH only', () => {
  const route = declaredRoutes().find((r) => r.path === '/team');
  assert.ok(route, 'no /team route found');
  assert.match(
    route.middleware,
    /requireRole\(\['HEAD_COACH'\]\)/,
    'downloading every athlete\'s data in one file belongs with the head coach'
  );
});

test('the athlete export checks self, coach or approved guardian in the handler', () => {
  // Not a route-level role gate: "is this you" is a data-scoped question,
  // so it lives in the handler. Assert the three branches are all there
  // and that it actually denies.
  const body = SOURCE.slice(SOURCE.indexOf("router.get('/athlete/:athleteId'"));
  assert.match(body, /linkedAthlete\?\.id === athlete\.id/, 'must allow the athlete themselves');
  assert.match(body, /hasTeamRole/, 'must allow a coach on the team');
  assert.match(body, /guardianLink/, 'must allow an approved guardian');
  assert.match(body, /status: 'approved'/, 'a PENDING guardian link must not be enough');
  assert.match(body, /res\.status\(403\)/, 'must deny anyone else');
});

test('every lookup is scoped by the session team, never by a client id', () => {
  assert.doesNotMatch(SOURCE, /req\.(params|body|query)\.teamId/);
  // The athlete lookup must carry teamId so an id from another team 404s
  // rather than confirming it exists.
  assert.match(SOURCE, /id: req\.params\.athleteId, teamId: req\.user\.teamId/);
});

test('nothing is written into an export without going through redaction', () => {
  // Both handlers must redact the top-level subject row too, not just the
  // manifest-driven tables — Team is where joinCode and the Stripe ids
  // live, and it is fetched outside collect().
  assert.match(SOURCE, /team: redactDeep\(team\)/);
  assert.match(SOURCE, /athlete: redactDeep\(athlete\)/);
});

test('a failure never produces a file that looks like a valid export', () => {
  // Two distinct ways this goes wrong, and the first version had both.
  //
  // Mid-stream: once bytes are out the response cannot become a 500, so
  // the archive's error handler destroys the socket — a failed download
  // rather than a truncated file the browser saves happily.
  assert.match(SOURCE, /archive\.on\('error'/);
  assert.match(SOURCE, /res\.destroy\(\)/);

  // Before streaming: setHeader does NOT set headersSent, so a catch that
  // only checks that flag sends a JSON error body still labelled
  // Content-Type: application/zip. Observed for real — a 22-byte "zip".
  // failCleanly strips the download headers first.
  assert.match(SOURCE, /function failCleanly/);
  assert.match(SOURCE, /removeHeader\('Content-Type'\)/);
  assert.match(SOURCE, /removeHeader\('Content-Disposition'\)/);
  assert.doesNotMatch(
    SOURCE,
    /if \(!res\.headersSent\) res\.status\(500\)/,
    'headersSent alone is not enough — the download headers are already set by then'
  );

  // And the archive is constructed before any header is touched, so a
  // constructor failure leaves the response clean to answer honestly.
  const zipFn = SOURCE.slice(SOURCE.indexOf('function sendZip'));
  assert.ok(
    zipFn.indexOf('new ZipArchive') < zipFn.indexOf("setHeader('Content-Type'"),
    'build the archive before setting download headers'
  );
});
