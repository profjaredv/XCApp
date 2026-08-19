// T1 (Team Management handoff), captain permission allowlist. The doc's
// most important section is explicit: captains are minors and must never
// see, for anyone, training log entries/notes, race reflections, another
// athlete's analytics beyond public race results, or contact/guardian
// info — enforced at the query layer, never conditional rendering.
//
// What this file CAN verify today: captains are not a distinct TeamRole
// (they're TeamRole.ATHLETE with SeasonRoster.isCaptain — see
// prisma/schema.prisma), so there is no route-level guard that could ever
// distinguish "a captain" from "any other athlete" in the first place.
// The only "may never see" item with an existing route surface at all is
// training logs, and every training-log route is hardcoded to
// req.user.linkedAthlete.id — there is no code path, for a captain or
// anyone else, that can read another athlete's log. This test asserts
// that invariant statically (source inspection, matching the style of
// routeAuth.test.js) rather than by spinning up a live request, since
// this codebase has no integration-test harness yet.
//
// What this file deliberately does NOT claim to verify: "another
// athlete's analytics beyond public race results" and "contact/guardian
// details" — analytics routes (routes/analytics.js) are currently open to
// any requireTeam'd team member, captain or not, and guardian contact
// fields don't exist yet (T1c, guardian access). Locking analytics down
// per-captain isn't meaningful until T2's GroupLeader exists to scope
// against — right now a captain and a regular athlete are the same
// principal, so restricting one restricts both, which is a broader
// product decision than this pass is asking for. Real enforcement lands
// with T2-T4; this file guards the one boundary that exists today and
// documents the rest rather than faking coverage.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ATHLETES_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'athletes.js');

test('every training-log route handler is scoped to req.user.linkedAthlete.id, never a client-supplied athleteId', () => {
  const source = fs.readFileSync(ATHLETES_ROUTE_PATH, 'utf8');

  // Isolate the training-log section (between its section comment and the
  // next one) so a change elsewhere in the file can't accidentally
  // satisfy/break this check.
  const startMarker = 'const VALID_LOG_TYPES';
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, 'training-log section marker not found — did routes/athletes.js change shape?');
  const trainingLogSection = source.slice(start);

  // Split into per-route-handler chunks on `router.<method>(` — checked
  // per handler, not per individual prisma call, because DELETE first
  // loads the row scoped to linkedAthlete.id via findFirst and only then
  // deletes by its already-verified internal id (`log.id`), which is
  // exactly as safe but wouldn't reference linkedAthlete.id on that one line.
  const handlers = trainingLogSection.split(/(?=router\.(?:get|post|put|delete|patch)\()/);
  const trainingLogHandlers = handlers.filter((h) => h.includes('prisma.trainingLog'));
  assert.ok(trainingLogHandlers.length >= 3, `expected at least 3 training-log route handlers, found ${trainingLogHandlers.length}`);

  for (const handler of trainingLogHandlers) {
    const routeLine = handler.split('\n')[0];
    assert.match(
      handler,
      /req\.user\.linkedAthlete\.id/,
      `training-log handler never references req.user.linkedAthlete.id — it may be readable by someone other than the athlete it belongs to:\n${routeLine}`
    );
    assert.doesNotMatch(
      handler,
      /athleteId:\s*req\.(params|body|query)/,
      `training-log handler accepts a client-supplied athleteId instead of using req.user.linkedAthlete.id:\n${routeLine}`
    );
  }
});

// Part B (Band Analytics doc): "Captains get no special access here and
// must not receive individual athlete rows — this endpoint returns
// aggregates only." GET /api/analytics/bands has no captain-specific guard
// (same "captains aren't a distinct TeamRole" situation as above) — the
// requirement it actually needs to satisfy is structural: nobody, captain
// or coach, ever gets an athleteId or athlete name back from this route.
// Checked by source inspection (no live-request harness in this repo, same
// approach as the rest of this file) rather than trusting that every
// summarizeBand/entries object literal omits identifying fields by habit.
const BAND_ANALYTICS_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'bandAnalytics.js');

test('band analytics route never includes an athlete id or name in its response', () => {
  const source = fs.readFileSync(BAND_ANALYTICS_ROUTE_PATH, 'utf8');

  // Every object that ends up in res.json(...) is built from `entries`
  // (per-race pace/time/fieldRatio rows) or aggregated further from those —
  // as long as no object literal anywhere in the file assigns an
  // `athleteId:` or athlete `name:` key OUTSIDE of building/consuming that
  // internal `entries` array itself, nothing identifying can reach the
  // response. The `entries` array's own construction (which legitimately
  // carries athleteId internally, to compute per-athlete ranks and
  // dedupe counts) and the raw Prisma `select` are the two allowed
  // exceptions.
  const allowedAthleteIdLines = [
    /athleteId: r\.athleteId,/, // inside the entries.map(...) that builds internal rows
    /select: \{ id: true, distanceMeters: true, fieldMeanSec: true \}/, // Prisma race select, no athlete fields
    /athleteId: true,/, // Prisma result select
  ];

  const athleteIdLines = source
    .split('\n')
    .filter((line) => /athleteId\s*:/.test(line) || /\bname:\s*(athlete|r\.athlete|e\.athlete)/i.test(line));

  for (const line of athleteIdLines) {
    const isAllowed = allowedAthleteIdLines.some((pattern) => pattern.test(line));
    assert.ok(
      isAllowed,
      `bandAnalytics.js has an unexpected athleteId/name-bearing line that may leak into the response: ${line.trim()}`
    );
  }

  // Belt-and-suspenders: the final res.json(...) payload's own top-level
  // keys (asserted by name here, so this breaks loudly if someone adds a
  // new field to the response) never include anything athlete-identifying.
  const resJsonMatch = source.match(/res\.json\(\{([\s\S]*?)\}\);\s*\}\s*catch/);
  assert.ok(resJsonMatch, 'could not locate the success res.json(...) call in bandAnalytics.js');
  const resJsonBody = resJsonMatch[1];
  assert.doesNotMatch(resJsonBody, /athleteId/i);
  assert.doesNotMatch(resJsonBody, /athleteName/i);
});

// E1 (LeadPack Master Build Handoff): "another athlete's analytics beyond
// public race results" — flagged above as unenforced when this file was
// written — is now real for GET /analytics/athlete/:athleteId/journey.
// This is the first route in the app where a captain and a regular
// athlete genuinely diverge in what they receive from the *same* handler:
// both are TeamRole.ATHLETE, but the route computes isSelf per-request
// (req.user.linkedAthlete.id === req.params.athleteId), so a captain
// viewing anyone but themselves fails it exactly like any other athlete
// would — see lib/athleteJourneyPermissions.test.js for the exhaustive
// case coverage of decideCanViewAthleteJourney itself. This test just
// confirms the route actually wires that function in, by source
// inspection (same approach as the rest of this file).
const ANALYTICS_ROUTE_PATH = path.join(__dirname, '..', 'routes', 'analytics.js');

test('GET /analytics/athlete/:athleteId/journey is gated by decideCanViewAthleteJourney, not open to any team member', () => {
  const source = fs.readFileSync(ANALYTICS_ROUTE_PATH, 'utf8');

  assert.match(
    source,
    /require\(['"]\.\.\/lib\/athleteJourneyPermissions['"]\)/,
    'routes/analytics.js does not import decideCanViewAthleteJourney'
  );

  const routeStart = source.indexOf("router.get('/athlete/:athleteId/journey'");
  assert.ok(routeStart !== -1, 'journey route handler not found');
  const journeySection = source.slice(routeStart, routeStart + 2000);

  assert.match(journeySection, /decideCanViewAthleteJourney\(/, 'journey route never calls the permission decision function');
  assert.match(journeySection, /status\(403\)/, 'journey route has no 403 path for a denied viewer');
});
