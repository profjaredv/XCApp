# Notes for the next session

Per the XCApp Build Spec's rules of engagement: things noticed while building
that are out of scope for the current phase, rather than acted on unasked.

## Phase 0 — outstanding, not code-fixable from this environment

This session ran in a sandbox with no live database access (Postgres port
5432 blocked; only HTTPS egress works) and no access to Railway's dashboard
or env vars. These need a human or a live-access session:

- **Database backup.** Not taken. Do this before anything in Phase 1 that
  touches production data (the distance-parser fixes truncate three metrics
  tables).
- **Rotate `COACH_UPGRADE_CODE`** on Railway. Not done — no access to
  Railway env vars from here.
- **Verify gate 0's live half**: sign in as a non-coach team member against
  the deployed app and confirm `DELETE /api/athletes/:id` returns 403. The
  static half (every non-GET route has a guard) is automated and passing —
  see `backend/test/routeAuth.test.js`, run via `npm test`.
- ~~`XCApp-red-team-audit.md` missing~~ — received and reviewed. See below
  for what it changed.

## S2 (audit): cross-team coach escalation — fixed

The audit's most severe finding wasn't in the build spec's Phase 0 checklist
and would have shipped past this session unaddressed otherwise. Real, live
chain: `POST /profile/upgrade-to-coach` set a global `User.role = 'coach'`
never scoped to any team and never downgraded; `POST /team/join` (or
`/profile/join-team`) lets anyone switch `teamId` to any team via its join
code with no check on existing membership elsewhere. Put together, a coach
of Team A (or anyone who used the shared upgrade code) could join Team B via
its join code and `requireCoach` — which only checked the sticky global
role — would treat them as Team B's legitimate coach: invite athletes,
approve claims, generate a new join code, edit/delete the roster.

Fixed: `requireCoach` now checks team-scoped standing — either
`Team.coachUid === req.user.id` (owns this team), or a `'coach'` row in
`TeamMember` for `(req.user.teamId, req.user.id)` specifically. Fast path
for the common case (a coach acting on the team they created) costs no
extra query. `POST /upgrade-to-coach` now also upserts the `TeamMember` row
for the account's current team, scoping the grant instead of leaving it
global. `User.role` is kept as-is for onboarding-UX purposes only; it is no
longer trusted for authorization anywhere.

Not re-verified against a live deploy — same sandbox constraint as
everything else in Phase 0. Worth a manual check: create two teams, upgrade
one account to coach on Team A via the shared code, join Team B with that
account, confirm coach-only actions on Team B now 403.

## From the audit, not yet acted on (flagged, not guessed at)

- **S4, privacy/FERPA**: no retention policy, no deletion path for a
  departed athlete, no guardian-consent concept, and `TrainingLog.notes` is
  free text a minor writes with no defined coach-read boundary (currently
  no coach read path exists at all for it, which the audit calls "the safe
  default" — deliberate, not just fixed, is Phase 6 territory). Also:
  confirm the previously-committed Gemini key (noted in
  `MIGRATION_STATUS.md`) was actually rotated, not just deleted from the
  repo. This is a policy/legal question for a human, not something to
  silently decide in code.
- **S5, minor**: `server.js` hardcodes the production CORS origin as a
  single string — fine today, will need to become a list the moment a
  second domain is added. Not changed, since there's only one production
  origin right now and guessing at future domains isn't this session's
  call to make.

## Phase 0 — `Result.status`: done, but incomplete on purpose

Added the `ResultStatus` enum and `Result.status` column (migration
`20260726000000_result_status`), defaulting new rows to `FINISHED`.
Existing null/non-positive-time rows were backfilled to `DNF` — an inferred
assumption (see the migration's comment), not a verified one; DNS and DQ
were never distinguishable from the existing data. Worth a manual pass if
that distinction matters before Phase 3 leans on it.

**Not done**: rewriting the ~12 query sites across `services/performance/
calculationServiceSupabase.js`, `routes/analytics.js`, `routes/team.js`,
`routes/multiSeasonTrends.js`, `routes/coachesTools.js`, `routes/athletes.js`,
and `routes/enhancedPerformanceRoutes.js` to filter on `status: 'FINISHED'`
instead of the existing `time: { gt: 0 }` convention. That convention
already achieves the same practical filtering today, so nothing is currently
broken by leaving it — but per rule 5 ("write the test before the fix for
anything arithmetic"), rewriting a dozen aggregate queries without tests
backing each one first felt like exactly the kind of rushed arithmetic
change the rule exists to prevent. This should be its own pass: write the
test, then migrate each site, then delete the old convention — not bundled
into Phase 0 alongside seven other things.

## Possible duplicate implementation worth checking before Phase 6

`routes/seasons.js` (`/api/seasons/...`, keyed by season UUID) and
`routes/teams.js`'s `/api/teams/seasons/:year/roster/...` (keyed by season
year) both do roster add/remove/clear-results. Didn't dig into which one the
frontend actually uses before fixing both — flagging in case one turns out
to be the "second implementation" rule 3 says to delete rather than fix.
