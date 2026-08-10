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
