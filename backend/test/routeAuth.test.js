// Verify gate 0 (XCApp Build Spec, Phase 0): every non-GET route must carry
// an authorization guard beyond `authenticate` — a route that only checks
// "is this a valid, signed-in user" and nothing else is exactly the bug
// class this gate exists to catch (see routes/athletes.js POST/PUT/DELETE
// and routes/seasons.js and routes/meetGroups.js before this fix, which had
// none). Add a new mutating route without a guard and this test fails the
// build, on purpose.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ROUTES_DIR = path.join(__dirname, '..', 'routes');

const GUARD_NAMES = new Set(['requireTeam', 'requireRole', 'requireLinkedAthlete', 'requireApprovedGuardianLink', 'requireSuperAdmin']);

// Routes that intentionally carry no guard beyond `authenticate`, and why.
// This is a real allowlist, not an escape hatch — every entry is a route
// that CANNOT sensibly require team/coach membership (it's what grants that
// membership in the first place) or that is provably self-scoped to the
// caller's own row. Anything not on this list must have a guard.
const ALLOWED_UNGUARDED = new Set([
  // Join-by-code: the code IS the authorization boundary, rate-limited at
  // 10/hour/IP in server.js. There is no team to require yet — that's what
  // this route grants.
  'profile.js POST /join-team',
  // Retired (T1): always responds 410 Gone, grants nothing, checks nothing
  // team/role-scoped. Kept registered so old links get an explanation
  // instead of an ambiguous 404 — see routes/team.js POST /staff-invite
  // for the replacement.
  'profile.js POST /upgrade-to-coach',
  'profile.js POST /fix-coach-role',
  'team.js POST /join',
  // F2/F3 (LeadPack Master Build Handoff): claiming a team is what GRANTS
  // team membership, same logical contradiction as team.js POST /join and
  // POST /accept-staff-invite above — requireTeam/requireRole can't apply
  // before the caller has either. The token itself is the authorization.
  'teamClaims.js POST /:token/claim',
  // Self-scoped: writes only req.user.id's own row, never a body-supplied
  // user id — no cross-user or cross-team surface exists to guard.
  'users.js PUT /me',
  // Deliberately open to any signed-in user; every field written is scoped
  // to req.user.id / req.user.teamId, never to a body-supplied id.
  'feedback.js POST /',
  // Asking for a team to be created. Requiring team membership here would
  // be circular — this is the route for people who have none — and the row
  // it writes is scoped entirely to req.user.id and req.user.email, with
  // no body-supplied identity. Approving one is separately super-admin
  // only (routes/admin.js), so filing a request grants nothing.
  'teamRequests.js POST /',
  // The invite token itself is the authorization (a coach already named
  // this exact athlete/invitee when creating it) — not team/role membership.
  'athletes.js POST /accept-invite',
  'team.js POST /accept-staff-invite',
  // A guardian isn't a team member, so requireTeam/requireRole don't apply —
  // this only creates a *pending* GuardianLink tied to req.user.id; it
  // grants no access by itself (see requireApprovedGuardianLink, and
  // team.js POST /approve-guardian-link, which does require a role).
  'guardian.js POST /request-link',
  // Same reasoning, one step earlier: a parent has to SEE the roster to
  // say which children are theirs. The join code is the boundary — it is
  // the same list anyone holding that code can already reach by joining —
  // and this route only reads. It creates nothing and grants nothing, so
  // there is no role it could require that a guardian would have.
  'guardian.js POST /lookup',
  // E2 usage logging: fires from pages a signed-in-but-teamless user can
  // still land on (onboarding, join-team), and the write itself carries no
  // team/user/athlete id at all (see lib/pageViewLogging.js) — there is no
  // cross-team or cross-user surface here to guard against.
  'pageViews.js POST /',
]);

function collectRouteMiddlewareNames(routeLayer) {
  return routeLayer.stack.map((layer) => layer.name).filter(Boolean);
}

test('every non-GET route carries an authorization guard beyond authenticate', () => {
  const failures = [];

  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith('.js')) continue;

    // eslint-disable-next-line import/no-dynamic-require, global-require
    const router = require(path.join(ROUTES_DIR, file));
    if (!router || !router.stack) continue; // not an Express Router export

    for (const layer of router.stack) {
      if (!layer.route) continue; // router-level middleware, not a route

      const routePath = layer.route.path;
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);

      for (const method of methods) {
        if (method === 'get') continue;

        const handlerNames = collectRouteMiddlewareNames(layer.route);
        const hasGuard = handlerNames.some((name) => GUARD_NAMES.has(name));
        const key = `${file} ${method.toUpperCase()} ${routePath}`;

        if (!hasGuard && !ALLOWED_UNGUARDED.has(key)) {
          failures.push(`${key} — middleware: [${handlerNames.join(', ')}]`);
        }
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Routes missing an authorization guard beyond 'authenticate':\n${failures.join('\n')}\n\n` +
      `If this route genuinely needs no guard, add it to ALLOWED_UNGUARDED in this file with a reason.`
  );
});
