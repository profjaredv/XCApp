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
- **`XCApp-red-team-audit.md`**, the companion doc the build spec's header
  references for "file-and-line detail behind the Phase 0 fixes," is not in
  this repo. Phase 0 was completed by reading the actual route files
  directly instead — worth confirming nothing in that doc was missed if it
  turns up later.

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
