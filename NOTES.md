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

## Phase 1 — distance parser: code done, DB steps pending on you

`backend/lib/distance.js` is now the one parser, tested against this team's
actual production data (`SELECT distance, COUNT(*) FROM races GROUP BY
distance` — 5 distinct strings, 27 races, all clean "N Meters"/"N Miles"
formats, no commas-inside-numbers edge case actually hit in your data) plus
every failure case from the audit, in `test/distance.test.js` (`npm test`).

Turned out to be **six** duplicate implementations, not four — the audit
listed `utils/distanceParser.js` (deleted; had zero callers, entirely dead),
`multiSeasonTrends.js`, and `calculationServiceSupabase.js`, but missed two
more found while grepping: an inline parser in `routes/teams.js` (the actual
live import-time parser — already correct, extracted into lib/distance.js
rather than rewritten) and one in `routes/team.js`'s `/performance` endpoint,
which had its own comma bug and would silently compute 0 miles for any race
whose `distanceMeters` was ever null and whose text was "N,NNN Meters" —
15 of your 27 races are exactly that format. Whether that ever actually hit
production numbers depends on whether `distanceMeters` was already populated
for those races (likely yes, since the import-time parser was already
correct) — not verified from here either way.

The audit's claimed fourth duplicate, "the frontend duplication in
`web/src/utils/dataTransformers.ts`," doesn't exist as a string parser —
that file only ever reads an already-numeric `distanceMeters`/`distance`
field. Not deleted because there was nothing there to delete.

**Verify Gate 1 — passed:**
- Test table: `npm test`, zero failures.
- `SELECT COUNT(*) FROM races WHERE distance_meters IS NULL` → 0, fully
  explicable (all 27 races are one of the 5 known clean formats).
- Hand-check: SQL-computed total miles for Finley Woods-Vallejo (27.03 mi,
  both 2024 and 2025, computed directly from `results`/`races`, bypassing
  any cache) matched the app's displayed season totals for both seasons.

**DB steps — done:**
- `backend/scripts/backfillDistanceMeters.sql` run via the Neon SQL
  Editor — 0 rows needed correction (the live import parser was already
  correct, confirming the six-duplicate-parser bugs never actually fired
  on this team's data; see below).
- `backend/scripts/truncateMetricsCache.sql` run — cleared and
  recalculated `team_season_metrics`, `athlete_season_metrics`,
  `meet_performance_metrics`. Precautionary, not a fix for a known-wrong
  number: since `distance_meters` was never null in this dataset, the
  buggy fallback paths in the other five parsers never had a reason to
  fire. Run at the user's request for certainty, not because a wrong
  number was ever observed.

**One more residual "default to 5K" spot, not fixed**: `calculationService
Supabase.js:498`, `(m.distance || 5000) / 1609.34` inside a precomputed
meet-metrics series builder. Different shape than the string-parsing bugs
above (this is a numeric field with a missing-data fallback, not text
parsing), and understanding whether it's safe to remove needs tracing the
`MeetPerformanceMetrics` computation pipeline — left alone rather than
guessed at in the same pass as everything above.

## Bugs found and fixed while closing out Phase 1 (not in the audit)

None of these are distance-parser bugs — they surfaced from live user
reports while verifying Phase 1 — but they're worth a permanent record
since the pattern recurred three times:

- **Season context lost on navigation/default.** `RosterPage`'s "View
  Profile" link, `AnalyticsPage`'s default view, `TeamAthleteProfilePage`'s
  direct-link default, and two season-picker-less screens
  (`CoachesToolsPage`, `RaceVisualizationPage`) all either dropped the
  currently-viewed season when navigating, or defaulted to the team's
  active season without checking whether it actually had data — showing
  an empty page whenever the active season was a fresh preseason. Fixed
  in each; added a shared `useCurrentSeasonWithData()` hook for the two
  screens with no season picker of their own. Deliberately left
  `DataManagementPage`/`ScraperControls` alone — those import data *into*
  the active season, so defaulting there regardless of data is correct.
- **Athlete chart plotted raw time, not pace.** `AthleteDetailModal`'s
  "Race Performance Over Time" chart plotted `race.time` directly, mixing
  races of very different distances (a 1-mile time trial next to a 5K) on
  one axis — looked like wild fitness swings, was actually just distance
  differences. Now plots pace; also breaks the line at season boundaries
  (it previously drew one continuous line straight through the off-season)
  and added a fitted trend line, independent of the results table's sort
  state (which the chart's point order used to inherit).
- **`setSearchParams` race condition — "Past Seasons" did nothing.**
  Calling two separate `useQueryParam` setters back to back
  (`setSeasonModeParam(...)` then `setSelectedSeasonParam(...)`) silently
  dropped the first call: each snapshots the URL at render time before
  navigating, so the second call's snapshot doesn't include the first
  call's change, and its `replace` navigation overwrites it. Added
  `useSetQueryParams()` (sets multiple keys in one call) and fixed both
  call sites in `AnalyticsPage`. Worth grepping for if this pattern shows
  up again elsewhere — it's an easy trap to fall into with this hook.

## Possible duplicate implementation worth checking before Phase 6

`routes/seasons.js` (`/api/seasons/...`, keyed by season UUID) and
`routes/teams.js`'s `/api/teams/seasons/:year/roster/...` (keyed by season
year) both do roster add/remove/clear-results. Didn't dig into which one the
frontend actually uses before fixing both — flagging in case one turns out
to be the "second implementation" rule 3 says to delete rather than fix.

Also: `web/src/components/SeasonModeSelector.tsx` and `web/src/components/
analytics/SeasonModeSelector.tsx` are two separate components with the same
name and overlapping purpose (mode toggle + season picker), used by
`TeamAthleteProfilePage` and `AnalyticsHeader` respectively, with different
prop shapes and no shared code. Left both alone this pass — merging them
means reconciling `TeamAthleteProfilePage`'s local `seasonMode` state
(`'current' | 'all' | 'custom'`, not URL-backed) with `AnalyticsPage`'s
URL-param-based one, which is more than a "fix a bug" change.

## Phase 2, step 1: meet href capture — done

Per the Build Spec's Phase 2 order of work: `scrape_season_playwright.js`'s
meet-key extraction now captures `nameA.href` (browser-resolved absolute
URL) and parses `athleticMeetId` out of it via `/meet/(\d+)/`, alongside the
existing name/date. Same patch applied to `scrape_season.py` (still the
non-Railway dev-mode scraper; used `urllib.parse.urljoin` since bs4 doesn't
resolve relative URLs like a browser does). Both scrapers now emit two new
trailing CSV columns, `Source URL` and `Athletic Meet ID`; `routes/teams.js`
`POST /scrape` reads them and writes `Race.sourceUrl` / `Race.athleticMeetId`
(migration `20260727000000_race_source_url`, additive/nullable, no backfill
possible since the URL was never captured before — existing races stay
`NULL` until their season is re-scraped).

Also added, while in this file for other reasons: two canary checks in the
scraper's retry loop, since the audit specifically flagged silent
mis-parsing as the scraper's biggest risk. (1) meets listed but zero
results parsed — that combination can't be a legitimately-empty season, so
it's treated as a structure break and retried/fails loudly. (2) more than
half of parsed rows missing a grade — signals the `y9`/`y10`/`FR`-`SR`
grade convention broke, not that the team happens to be mostly ungraded.
Both are regression-tested against fixture HTML in `test/scraper.test.js`
(`test/fixtures/season-*.html`), per the audit's Phase 4 recommendation to
catch a page-structure change in CI rather than by a coach noticing wrong
numbers. Note for whoever next runs this suite somewhere the Playwright npm
package's pinned browser revision isn't pre-installed: the test respects an
optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var as a launch-option
override; unset (the normal case), it's a no-op.

Explicitly did not pursue athletic.net's internal `GetAllResultsData` JSON
API as an alternative to HTML scraping for this or the Phase 2 full-field
work: it sits behind Cloudflare and only returns data with a live logged-in
session's `cf_clearance` + `anet-site-roles-token` + `anettokens` (verified
by hitting it without those headers — 403 challenge page, not JSON). Building
on that would mean storing a personal Athletic.net login session
server-side and refreshing short-lived Cloudflare cookies indefinitely,
which is worse than anonymous page scraping on both counts the audit cares
about (credential exposure, ToS posture). Phase 2's own fallback path
(Playwright against the public meet-results HTML page, same anti-bot
handling as the season scraper) is the right approach and is next up.

Not yet done, still ahead in Phase 2: `scrape_meet_playwright.js` (the new
full-field scraper, fixture-first per the spec), `FieldResult` +
`Race.fieldMeanSec`/`fieldMedianSec`/`fieldFinisherCount`, and
`Athlete.athleticAthleteId` + relaxing the `[teamId, name]` unique
constraint.

## Phase 2, step 2: Course model + review-mapping tooling — code done, DB steps pending on you

Added `Course` (migration `20260727010000_courses`) exactly as specced: not
team-scoped (two teams at the same venue share one row), unique on
`[name, city, state]`, plus a nullable `Race.courseId` → `Course` (SetNull
on delete). Purely additive — no data migrated by the schema migration
itself, since course assignment has to go through the review flow below.

The mapping proposal is deliberately two separate steps, matching the
spec's "a coach confirms the mapping before it is applied" requirement:

- `backend/lib/courseMapping.js` — pure grouping logic, unit-tested
  (`test/courseMapping.test.js`, 6 cases). Groups races only by **exact**
  match on normalized `location` text (trim/collapse-space/case-fold —
  normalization, not fuzzy similarity) and cross-references `MeetGroup`
  membership. Two races a coach already linked into the same MeetGroup but
  with *different* location text come back as a `meetGroupConflicts` entry
  to review by hand, never auto-merged. Races with no location text at all
  come back as `unmapped` — nothing invented for them.
- `backend/scripts/proposeCourseMapping.js` — read-only against the DB,
  writes `scripts/course-mapping-proposal.json` with every proposed course
  defaulted to `"decision": "pending"`. Nothing is applied by running this.
- `backend/scripts/applyCourseMapping.js` — reads that file back, applies
  **only** entries marked `"decision": "confirmed"` (upserts the `Course`
  row, sets `Race.courseId` for its `raceIds`, whole run in one
  transaction), reports `"pending"`/`"rejected"` entries as skipped. Supports
  `--dry-run`.

**Could not run the propose script against real data from this sandbox** —
same constraint as Phase 0/1 (Postgres port 5432 blocked, confirmed again
by hand: `npx prisma db execute` times out with P1001 against the Neon
host). Verified the logic itself instead: unit tests above, plus manually
piping synthetic race data through `buildCourseMappingProposal` and both
scripts' JSON read/write and dry-run paths outside of Prisma. Everything
downstream of a real DB connection — actually generating
`course-mapping-proposal.json` from this team's real races, reviewing it,
and running the apply script — needs a live-access session or your own
machine:

```
node scripts/proposeCourseMapping.js
# review/edit scripts/course-mapping-proposal.json — set decision to
# "confirmed" or "rejected" per entry, fix confirmedName/city/state as needed
node scripts/applyCourseMapping.js --in scripts/course-mapping-proposal.json --dry-run
node scripts/applyCourseMapping.js --in scripts/course-mapping-proposal.json
```

**Verify gate 2a status**: code side is ready; the actual gate (this
team's course mapping reviewed and confirmed by you, `Race.sourceUrl`
populated for a full imported season) still needs the propose/apply run
above plus a re-scrape of at least one season with the patched scraper from
step 1.

Deliberately not touched yet: `MeetGroup`/`MeetGroupRace` stay exactly as
they are (spec: keep them read-only for one release once `Course` lands,
then delete — that's a later cleanup pass, not this one).
