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

## Phase 2, step 3: `scrape_meet_playwright.js` — blocked, not started

The spec is explicit: "dump the raw HTML of one real meet page to a fixture
file and inspect it before writing any selectors... do not write selectors
from assumption." Tried to get that real page two ways, both failed for
reasons outside this codebase:

- Playwright/Chromium in this sandbox cannot reach the network through the
  environment's HTTPS proxy at all — `net::ERR_CONNECTION_RESET` on every
  attempt, reproduced against an unrelated, definitely-allowed host
  (`registry.npmjs.org`) too, so this is a sandbox/proxy limitation, not
  specific to athletic.net.
- `curl` *can* reach athletic.net through the proxy, but
  `/CrossCountry/meet/{id}/results/all` is behind a Cloudflare JS challenge
  (`cf-mitigated: challenge`, HTTP 403) — curl can't execute that challenge,
  only a real rendering browser can, which is exactly what's blocked above.

Per rule 1/3, not fabricating plausible-looking meet-page HTML to write
selectors against. This needs either a live-access session where Playwright
can actually reach the internet, or a real meet page's HTML saved by hand
(e.g. a browser "Save As" or view-source on `athletic.net/CrossCountry/
meet/<id>/results/all`) dropped in as `test/fixtures/meet-page-raw.html`
for me to inspect and build selectors from. Steps 4 and 5 didn't need live
scraping and are done (below); this one is genuinely stuck without one of
those two things.

**Update:** re-verified this blocker fresh in a later session (same result
— `curl` gets Cloudflare's `cf-mitigated: challenge` 403, Playwright's
Chromium gets `net::ERR_CONNECTION_RESET` on every host, proxied or not).
Rather than keep waiting on it, built the fallback the product needs
regardless of whether the scraper ever lands: manual field-results upload.
A coach views a meet's full results page in their own browser (which isn't
blocked — only this sandbox's automation is) and uploads a CSV of it.
`backend/lib/fieldResultsCsv.js` (pure parse/validate, unit-tested),
`backend/lib/time.js` (shared time-string parser, new third copy —
deliberately not touching `routes/teams.js`'s working inline one for this,
see that file's comment), `backend/routes/fieldResults.js` (`GET
/api/field-results/races?season=`, `POST /api/field-results/:raceId`,
`DELETE /api/field-results/:raceId`), and `web/src/pages/
FieldResultsPage.tsx` (`/t/:athleticTeamId/field-results`, coach-only nav
item). Writes the same `Race.fieldMeanSec`/`fieldMedianSec`/
`fieldFinisherCount` fields `scrape_meet_playwright.js` would have — Band
Analytics' `normalizationAvailable` flag and `fieldRatio` metric activate
identically either way, no consumer-side change needed. This doesn't
replace the scraper if it ever gets unblocked (bulk import at scale is
still worth having) — it's the path that works today, and stays useful
afterward for any race the scraper can't reach.

## Phase 2, step 4: `FieldResult` + `Race` normalization fields — done

Added exactly per spec: `FieldResult` (holds other schools' finishers,
comment on the model spells out aggregate-reads-only, never a named-row
endpoint, never linked to a `User`/`Athlete`) and `Race.fieldMeanSec` /
`fieldMedianSec` / `fieldFinisherCount` (migration
`20260727020000_field_results`, additive). Also added
`backend/lib/fieldNormalization.js` — the actual mean/median/40-finisher-
threshold arithmetic from "Core measurement decisions," unit-tested
(`test/fieldNormalization.test.js`) ahead of anything calling it, per rule
5. Nothing populates `FieldResult` yet — that's step 3, blocked above — so
these fields sit at `null` on every race for now, which is the documented,
correct state (`normalizationAvailable: false`) until the meet scraper
lands.

## Phase 2, step 5: `athleticAthleteId` + relaxed name uniqueness — done

Added `Athlete.athleticAthleteId` (migration
`20260727030000_athlete_athletic_id`) and dropped the
`@@unique([teamId, name])` constraint per the spec ("two students named
Jack Smith is a normal occurrence"). Flagging per rule 6: this migration
drops a unique constraint, not a column or table, and no rows are altered —
but it's exactly the kind of change that rule exists to surface, so it's
called out explicitly rather than folded in quietly.

`athleticAthleteId` stores the athlete's raw Athletic.net profile link
(`nameTag.href`), not a parsed-out numeric id — same reasoning as
`Race.athleticMeetId`'s sibling decision in step 1, except here there's
*no* confirmed real example of the URL shape at all (unlike meet URLs,
where the referer header from an earlier real browser session gave actual
evidence). Parsing a substring out of a URL I've never seen would be
guessing, which rule 3/7 rule out. The full href works fine as an opaque,
stable, globally-unique identifier regardless of its internal structure.

Captured this alongside the existing name/grade extraction in all four
scrapers that link to an athlete's name (`scrape_season_playwright.js`,
`scrape_season.py`, `scrape_roster_playwright.js`, `scrape_roster.py`) —
new trailing CSV column, `Athletic Athlete ID`.

Matching logic lives in `backend/lib/athleteMatching.js`
(`matchAthlete()`, unit-tested), preferring `athleticAthleteId` over name,
falling back to name when no id is available yet. Wired into both
`routes/teams.js` ingestion routes:

- `POST /scrape` (results import) no longer does `prisma.athlete.upsert`
  with the now-nonexistent `teamId_name` compound key — rewrote it to the
  same pre-fetch-then-match pattern `POST /scrape-roster` already used,
  keeping the lookup maps updated as new athletes get created mid-loop
  (many CSV rows share the same athlete across different races in one
  import).
- `POST /scrape-roster` already matched by hand (never used the compound
  key) — extended it to check `athleticAthleteId` first, and to backfill
  the id onto an existing athlete matched by name once a scrape provides
  one.
- `POST /api/athletes` (`routes/athletes.js`, coach manually adds an
  athlete) used to 409 on a duplicate `(teamId, name)` — removed that
  check, since it would otherwise block a coach from doing exactly what the
  relaxed schema is supposed to allow.

Consolidated `routes/teams.js`'s local `normalizeRosterName` into the one
`normalizeAthleteName` in `lib/athleteMatching.js` (rule 3 — was about to
become a second copy of the same normalization).

**Known, documented limitation, not fixed**: when a row has no
`athleticAthleteId` (not yet re-scraped, or an unparseable link) and two
existing athletes share that normalized name, the in-memory `byName` map
can only hold one of them — matching falls back to whichever one it kept.
This is the same ambiguity plain name-matching already had; it resolves
itself once everyone's been re-scraped and picked up a stable id, which is
the entire point of this field. Not attempting a cleverer resolution now
since that would be guessing at intent this data can't actually support.

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

---

# Team Management track (`XCApp Team Management: Build Handoff`)

A second, separate handoff document from the same coach — the daily-use
half of the app (roles/captains, groups, practice plans, meet ops, race
reflections, equipment), distinct from the analytics track above (bands,
courses, field normalization). Different product surface, same repo, same
rules of engagement (numbered the same way, P0/T1–T6 instead of
Phase 0–6).

## P0 — audited against this document's checklist: already satisfied

Went through every numbered P0 item against the current codebase before
writing anything new, since this document's P0 overlaps heavily with the
analytics track's own Phase 0 (already completed in an earlier session —
see "Phase 0 — outstanding" above). Result: every code-side item is
already done.

1. **Database backup** — not code-fixable from here, same as the analytics
   track's Phase 0 note above. Still outstanding, still needs a human.
2. **`requireCoach` on `routes/athletes.js` (POST `/`, PUT `/:athleteId`,
   DELETE `/:athleteId`), `routes/seasons.js` (POST `/`, PUT `/:id`, POST
   `/:id/roster`, DELETE `/:id/roster/:athleteId`, DELETE `/:id/results`),
   `routes/meetGroups.js` (all mutating routes)** — checked every route in
   all three files by hand; every one of these already carries
   `authenticate, requireTeam, requireCoach`. Nothing to fix.
3. **`routes/splits.js` POST `/batch`** — already fixed exactly as
   specced: `resultId`s are loaded with a `teamId` filter, count-checked
   against the request, `athleteId`/`raceId` are read off the loaded
   `Result` rows (never trusted from the client), and the batch runs in
   `prisma.$transaction`. The code comment on that route already explains
   the original vulnerability and the fix — this was S2/the splits half of
   an earlier audit pass.
4. **`express-rate-limit` + `helmet`, `express.json({ limit: '1mb' })`** —
   all present in `server.js`. The rate limiter (`roleChangeLimiter`) is
   10 requests/hour/IP as specced, applied to exactly the three routes
   named (`/api/profile/join-team`, `/api/profile/upgrade-to-coach`,
   `/api/team/join`).
5. **Rotate `COACH_UPGRADE_CODE`; remove stale `MONGODB_URI`/`FIREBASE_*`
   from `.env.example`** — `.env.example` is already clean (Neon/Prisma
   only, no Mongo/Firebase entries — this repo's whole history is the
   post-migration state). Rotating the actual Railway env var is a human/
   live-access action, still outstanding, same as item 1.
6. **`Result.status` enum** — done in the analytics track's Phase 0 (see
   above), including the DNF backfill.

**Verify gate P0**: the automated half (`backend/test/routeAuth.test.js`,
enumerates every route, asserts a non-`authenticate` guard on every
non-GET route) passes — `npm test`. The live half (sign in as a non-coach,
confirm `DELETE /api/athletes/:id` returns 403 against a *deployed*
instance) is the same outstanding item already noted under the analytics
track's Phase 0 — still needs a live/deployed session, not code.

**Net new code from this pass: none.** Confirming this instead of assuming
it — and writing down what was checked — felt more honest than either
silently skipping P0 as "already done elsewhere" or re-doing work that's
already correct.

## T1 — open questions resolved, build in progress

Asked before starting (per rule 7 and the document's own "settle before
T1, not after" instruction on guardian access). Coach's answers:
guardian access should exist, read-only, scoped to their own child's
performance/info only. Captain permissions: use the document's own
allowlist as written — it's already explicit and specific, nothing to
loosen. Proceeding continuously/autonomously from here per the coach's
instruction; committing and pushing incrementally rather than batching
everything into one giant change.

### T1a: `TeamRole` / `TeamMember` rewrite + `requireRole` — done

Replaced `TeamMember.role` (a free-text `'coach'|'athlete'` string) with
the `TeamRole` enum (`HEAD_COACH`, `COACH`, `VOLUNTEER_COACH`, `ATHLETE`)
exactly as specced, plus an `active` boolean (migration
`20260810230000_team_role`). The migration's `USING` cast only maps the
two values this app has ever written (`'coach'`→`HEAD_COACH`,
`'athlete'`→`ATHLETE`, per the doc's own instruction) and lets anything
else fail the column's `NOT NULL` constraint rather than guess — this is a
migration that **drops a unique-adjacent type change on an existing
column**, flagged explicitly per rule 6 even though no rows are altered.

`requireCoach` and `requireOwnTeam` are both gone, replaced by
`requireRole(allowedRoles)` (`middleware/auth.js`). Explicit allow-lists at
every call site, not an implicit hierarchy — a route that should accept
"any real coach" lists `['HEAD_COACH', 'COACH']` itself; nothing
auto-promotes. Went through all ~30 call sites individually rather than
find-and-replace, per the doc's own instruction: `DELETE` routes that
remove a roster entry, clear season results, or wipe imported data
(`athletes.js DELETE /:athleteId`, `seasons.js DELETE /:id/roster/:athleteId`
and `DELETE /:id/results`, `dataManagement.js POST /clear/:season`,
`teams.js DELETE .../results` and `PUT /:id` and `POST /seasons/:year/start`)
are `HEAD_COACH`-only; routine athlete/roster/result read-write
(scraping, adding to roster, invites, splits, plans/calculations, claim
approval) accepts `HEAD_COACH` and `COACH`. `VOLUNTEER_COACH` is
deliberately in **no** route-level list yet — their access is supposed to
be group-scoped, and groups don't exist until T2, so there's nothing yet
for a route-level check to scope them to.

Also retired `requireOwnTeam` itself, not just its name: every route that
used to check "is this the literal `Team.coachUid`" now checks
`requireRole(['HEAD_COACH'])`, which also passes for anyone else promoted
to `HEAD_COACH` via a staff invite (below). Deliberate widening, not an
oversight — multiple head coaches is the point of moving authority off a
single owner field.

**A real bug caught by testing, not guessing**: `requireRole([...])`
returns a factory-produced anonymous function; every call site invokes it
inline (`requireRole(['HEAD_COACH'])`), so the returned middleware's
`function.name` was `''`. `test/routeAuth.test.js`'s guard-detection reads
Express's `layer.name`, which comes straight from that `.name` — every
`requireRole`-protected route would have silently shown up as
*unguarded* the moment this shipped, the exact bug class that test exists
to catch, caused by the fix for a different bug. Fixed by making the
factory return a named function expression (`async function requireRole(...)`)
instead of an arrow function. `test/requireRole.test.js` now unit-tests
the middleware itself in isolation (owner fast-path, role-list matching,
`active: false` rejection, DB-error-is-500-not-silent-pass) per rule 5
("permission-related" is explicitly named alongside arithmetic) — stubbed
`prisma.teamMember.findUnique` by direct property assignment rather than
`node:test`'s `t.mock.method`, because Prisma's model delegates are
Proxy-based and `Object.getOwnPropertyDescriptor` reports `value:
undefined` for them, which `t.mock.method` rejects outright.

### T1b: retire `upgrade-to-coach`, add staff invites — done

`POST /api/profile/upgrade-to-coach` now always responds `410 Gone`
(kept registered rather than deleted, so a stale bookmark/client gets an
explanation instead of an ambiguous 404) — the shared
`COACH_UPGRADE_CODE` secret it checked is gone from `.env.example`
entirely, since nothing reads it anymore.

Replacement: `StaffInvite` (migration `20260810231500_staff_invites`),
structurally parallel to the existing `AthleteInvite` (token,
pending/accepted/revoked, re-inviting overwrites rather than
accumulates) but its own model rather than overloading `AthleteInvite`
with a nullable `athleteId` — granting team authority and linking a
roster row are different concerns. New routes in `routes/team.js`:
`POST /staff-invite` (head-coach-only, names an email + exact role),
`POST /accept-staff-invite` (token-scoped, mirrors
`athletes.js POST /accept-invite`), `GET /staff` and
`PATCH /staff/:userId` (head-coach+coach read / head-coach-only
role-or-active edit).

Frontend: added `StaffInviteAcceptPage.tsx` (mirrors `InviteAcceptPage.tsx`)
at `/staff-invite/:token`, wired an `acceptStaffInvite` alongside the
existing `acceptInvite` in `AuthProvider`/`AuthContext`. Rewrote
`UpgradeRolePage.tsx` (was the upgrade-code entry form) to point at the
new ask-your-head-coach flow instead of a dead endpoint. Deleted
`UpgradeToCoachForm.tsx` — its only caller was `web/src/_archive/
DashboardPage.tsx`, which was already dead (not reachable from the
router; `tsc -b` already failed on it before this change over an
unrelated missing import). Since deleting that component's last live
reason to exist made `_archive/` even more broken than it already was,
and both handoff documents separately list `web/src/_archive/` for
deletion under their respective cleanup sections, deleted the whole
directory now rather than leave increasingly-stale dead code around —
confirmed nothing outside it imports from it first. `tsc -b` and
`vite build` both clean afterward.

Not done in this pass: an actual "Staff" settings screen using the new
`GET /staff` / `PATCH /staff/:userId` endpoints — the backend surface
exists, but building the UI around it felt like it belonged with T3's
composer/settings work rather than bolted onto a security-retirement
commit. Noting it here so it isn't lost.

### T1c: captain designation — schema/route done; real permission enforcement waits on T2

Added `SeasonRoster.isCaptain` / `captainNotes` (migration
`20260810233000_captain_designation`) exactly where the doc says captaincy
belongs: per-season on the roster row, not on `Athlete` (not permanent)
and not a `TeamRole` value (a captain is still just `TeamRole.ATHLETE` —
"a designation, not a separate role," per the doc). Added
`PATCH /api/seasons/:id/roster/:athleteId` (`HEAD_COACH`/`COACH`) so a
coach can actually set it — there was no route touching these fields at
all before this.

**Read this before assuming the permission allowlist is "done," because
it mostly isn't yet, and that's a real, considered gap, not an oversight:**
the doc's captain section is explicit that enforcement must be an
allowlist at the query layer, never conditional rendering, and lists what
a captain may/may never see. Went through the "may never see" list against
the *current* codebase:

- **Training logs** — genuinely locked down already, by construction, not
  by anything new added here: every route in `routes/athletes.js`'s
  training-log section is hardcoded to `req.user.linkedAthlete.id`, never
  a client-supplied `athleteId`. Added
  `test/captainPermissions.test.js` to assert this statically (source
  inspection, same style as `routeAuth.test.js` — this codebase has no
  live-request integration harness to test it behaviorally).
- **Race reflections** — don't exist yet (T5). Nothing to guard.
- **Another athlete's analytics beyond public race results**,
  **contact/guardian details** — here's the real gap: `routes/analytics.js`
  is currently open to *any* `requireTeam`'d team member, and a captain is
  indistinguishable from a regular athlete at the authorization layer
  (both are plain `TeamRole.ATHLETE` — there is no `TeamRole.CAPTAIN`).
  Locking this down "for captains" right now would actually mean locking
  it down for *every* athlete, since the system has no way to tell them
  apart yet — that's a materially bigger, unrequested product change
  (team-wide analytics visibility might be entirely intentional; the doc
  doesn't say), not a captain-specific fix. The allowlist only becomes
  enforceable once a captain has something a regular athlete doesn't —
  which is exactly what T2's `GroupLeader` is for. Did not build a
  placeholder restriction with nothing real to scope it against; that
  would be guessing, which rule 3/7 rule out.
- **"The day's practice plan," "meet entry status and logistics" (the
  "may see" side)** — can't exist yet either; `PracticePlan` is T3,
  `MeetEntry`/`MeetPlan` are T4. The doc's own captain section already
  assumes those exist ("for athletes in groups they lead"), so T1 was
  never going to be able to fully close this gate by itself — it's
  sequenced to complete across T1 through T4, not finish in T1 alone.

Net: the designation itself (who is a captain, this season) is real and
usable. The safeguarding-critical part — a captain seeing *less* than a
coach — has nothing to violate yet because captains have no elevated
surface at all yet. That surface, and the allowlist enforcing it, arrives
with T2 (groups) onward. Flagging this prominently rather than letting a
task-tracker checkmark imply more coverage than exists.

### T1d: guardian access — done (backend); frontend not built this pass

Resolved per the coach's answer to the doc's open question 2: yes, limited
guardian access, read-only, scoped to their own child.

`GuardianLink` (migration `20260810234500_guardian_links`) mirrors
`AthleteClaim`'s pending/approved/rejected shape deliberately — a
guardian asserting "this is my kid" is the exact same unverified-identity
situation as an athlete asserting "this roster row is me," so it gets the
same coach-gated approval, not auto-grant-on-request. Routes:

- `POST /api/guardian/request-link` (`routes/guardian.js`) — a guardian
  isn't a team member and has no join flow of their own, so this reuses
  the team's existing join code purely as the "which team is this kid on"
  lookup (verifies the named athlete is actually on that team), then files
  a pending link. Grants nothing by itself.
- `GET /api/guardian/my-links` — self-scoped to `req.user.id`.
- `GET /api/guardian/athletes/:athleteId` — the actual read surface, gated
  entirely by a new `requireApprovedGuardianLink` middleware
  (`middleware/guardian.js`) rather than `requireTeam`/`requireRole`,
  since a guardian has no team role at all. Mirrors
  `athletes.js GET /:athleteId`'s response shape (profile + current-season
  race results) but hand-built rather than reused, and deliberately
  returns *less*: no `userId`/`athleticAthleteId`/timestamps, just what a
  parent needs. Neither training-log notes nor race reflections are in
  that response — not because of a guardian-specific filter, but because
  neither field is in the athlete-facing version either; there is nothing
  to accidentally leak here that isn't already excluded upstream.
- `GET /api/team/pending-guardian-links`, `POST /api/team/approve-guardian-link`
  (`routes/team.js`, `HEAD_COACH`/`COACH`) — the coach-side review queue,
  same shape as `pending-claims`/`approve-claim`, scoped through
  `GuardianLink.athlete.teamId` since a guardian link has no team column
  of its own.

`test/requireApprovedGuardianLink.test.js` unit-tests the middleware in
isolation (missing param, approved/pending/rejected/no-link, DB-error-is-
500) per rule 5, same stubbing approach as `requireRole.test.js` (direct
property assignment — Prisma's model delegates don't work with
`node:test`'s `t.mock.method`). `test/routeAuth.test.js`'s guard-name set
and allowlist both updated; full suite (45 tests) green.

**Not done this pass, and unlike the other T1 gaps above this one is a
scope call, not a sequencing block**: no frontend for any of this. A
guardian today has no UI to request a link, no UI to see their child once
approved, and a coach has no screen to review pending requests — the
routes exist and are tested, but nothing calls them. Unlike staff invites
(where `UpgradeRolePage` already existed and just needed repointing) and
unlike captain permissions (genuinely blocked on T2 not existing yet),
guardian access had no existing UI surface to extend and building one
from scratch — a request form, an approval queue, a read-only child-
performance view — is a real, separate chunk of frontend work. Chose to
land the backend (schema, routes, auth boundary, tests) solidly rather
than rush a UI in the same pass. Worth its own session.

## T2: Groups — backend done, frontend next

`Group`/`GroupLeader`/`GroupMembership` (migration `20260810240000_groups`)
exactly as specced: one model for training/captain/custom groups, not
three ("three tables means three assignment screens and three copies of
the same bug"). `GroupMembership` is effective-dated — `endDate: null`
means current, moving an athlete never updates `groupId` in place, it
closes the old row and opens a new one.

`lib/groups.js` — `getGroupOn(athleteId, date, type='TRAINING')`, the one
helper the doc says to write once and use everywhere rather than
scattering date-range queries through routes, plus `moveAthleteToGroup()`,
the one place a membership row gets closed/opened. Date-range convention
decided and documented since the doc didn't specify one: `startDate`
inclusive, `endDate` **exclusive** — the move date itself belongs to the
new group, not the old one. `isMembershipActiveOn()` is pure/DB-free and
unit-tested (`test/groups.test.js`) directly against the doc's own verify
gate wording: move an athlete mid-season, `getGroupOn` returns the old
group before and the new group after, and the test asserts via a fake
in-memory table that `update()` is only ever called on the OLD row and
only ever touches `endDate` — never `groupId`.

`routes/groups.js` — CRUD, leader assignment (exactly one `primary` per
group enforced in a transaction, not left to the DB, which can't express
that constraint), single-athlete move (`POST /:id/members`), bulk
assignment (`POST /assign`, one transaction for the whole save per the
doc), and `POST /copy-from-season` (best-effort: carries a group's active
members forward only if they're also on the new season's active roster,
since some will have graduated).

This is the **first place `TeamRole.VOLUNTEER_COACH` does anything** —
until now it was a role with nowhere to apply (see T1 notes above). A
volunteer can edit a group's own fields and move athletes into/out of it
only if they're that group's `GroupLeader`; staff assignment
(`POST /:id/leaders`) and group creation/deletion/bulk-assign stay
`HEAD_COACH`/`COACH`. The decision logic
(`lib/groupPermissions.js`, `decideCanManageGroup`) is DB-free and
unit-tested on its own (rule 5) rather than only exercised indirectly
through a route.

Also wired `GET /api/groups/athlete/:athleteId/current`, a real,
non-test consumer of `getGroupOn` (defaults to today, `TRAINING` type) —
so "use it everywhere" has at least one route backing it up, not just its
own test file.

Full suite: 63 tests green.

### T2: bulk assignment screen (frontend) — done, with real limits on how it was verified

`GroupsPage.tsx` (`/t/:athleticTeamId/groups`, added to the sidebar under
"Manage", visible to everyone — an athlete should be able to see their own
group same as Roster is visible to everyone). Two columns, boys and
girls, each rendered as an "Unassigned" staging list plus one card per
`TRAINING` group for that gender, ordered by `sortOrder`. Checkbox
multi-select across any column plus a floating "N selected → assign to
[group]" action bar, rather than drag-and-drop — noted in the previous
entry as the planned scope, and it held: multi-select is arguably faster
than dragging for a real 130-athlete bulk move anyway, and it was
buildable without pulling in a drag-and-drop library this pass. Save
batches every locally-pending change into one `POST /groups/assign` call.
"Copy from previous season" button appears when the selected season has
zero groups and a previous season with groups exists. Season-best time
per athlete card is computed client-side (`seasonBestTime()` in
`api/groupService.ts`) from `/api/athletes`'s existing per-race results —
no new backend endpoint needed for that part.

One real gap surfaced while wiring this up: `hooks/useSeasons.ts`
(`Season._id`) is dead/mistyped — nothing in the live app actually reads
`._id`, only `.year` — so groups (keyed by a real `seasonId` UUID) needed
a season source that actually carries a working id. `useAvailableSeasons`
already does (`Season.id: string | null`, null when a year exists only
implicitly from race data with no `Season` row yet) — used that instead
of fixing the stale hook, since fixing unrelated dead code wasn't this
pass's job. Handled the null case with an inline "set up this season"
button that creates the `Season` row via `POST /seasons` before the
groups screen will show group-creation UI.

**Verification, and its real limits**: `tsc -b` and `vite build` both
clean. Also started the Vite dev server and loaded the route in a headless
browser to confirm no client-side crash — but this sandbox has no live
backend/DB (same constraint noted throughout this file), and the app
requires an authenticated session before `GroupsPage` itself ever mounts
(unauthenticated, it correctly redirects to the sign-in UI, which is what
the headless check actually showed). So: confirmed the bundle is valid
and the app shell doesn't break, **not** that the assignment flow itself
behaves correctly end-to-end against real data — that needs a live-access
session with an actual team, roster, and season. Also: no frontend test
framework exists anywhere in this project (no vitest/jest, no existing
`*.test.ts` files) — didn't stand one up just to cover
`seasonBestTime`/`formatTime`, which felt disproportionate for two small
pure functions; flagging rather than silently skipping.

This closes out T2. Verify gate T2 as literally worded ("assign 130
athletes across eight groups in under five minutes... move one athlete
mid-season, confirm getGroupOn returns old-then-new, confirm no
membership row updated in place") is backend-provable now (the
`getGroupOn`/no-in-place-update half is unit-tested in
`test/groups.test.js`) but the "under five minutes" UX half needs a human
actually using the screen against real data — noted, not faked.

### T3: practice plans, per-group assignments, and workout templates (backend)

Schema: `PracticePlan` (one row per team per day, `@@unique([seasonId,
date])` so "the shell for a given day" is unambiguous), `PracticePlanAssignment`
(one row per group per day, `groupId` nullable meaning "whole team" — a
strength session or a meeting isn't any one group's workout), and
`WorkoutTemplate` (`@@unique([teamId, name])`). Inserting from a template
**copies** its fields onto the new assignment row; there is no FK from an
assignment to the template it came from anywhere in the schema, so
editing or archiving a template later can never retroactively change a
plan that already used it — same pattern as `SeasonRoster` never
referencing a live athlete-import source. Migration:
`20260811010000_practice_plans/migration.sql`, hand-written to match
Prisma's generated shape (`group_id` FK is `ON DELETE SET NULL` — deleting
a group orphans its past assignments to "whole team" rather than cascading
deletes into practice history).

`routes/practicePlans.js`:
- `GET /` — the coach composer's week-at-a-glance (`seasonId`, `from`,
  `to` query params), `HEAD_COACH`/`COACH`/`VOLUNTEER_COACH`. A volunteer
  coach's read is filtered to team-wide rows plus their own led groups'
  rows (`ledGroupIds()`), matching the doc's "sees and edits only rows
  targeting their own groups" — that constraint applies to reads, not
  just writes, so it's enforced in the query result, not just the mutation
  routes.
- `GET /mine?date=` — the athlete phone view (`requireLinkedAthlete`),
  published-only, filtered to team-wide rows plus whatever the athlete's
  *own current* `TRAINING` group is on that date via `getGroupOn` — this
  is the second real, non-test consumer of that helper (the first was
  T2's `/groups/athlete/:id/current`).
- `POST /` (day shell upsert) and `PUT /:id/publish` are `HEAD_COACH`/
  `COACH` only — a volunteer's authority doesn't extend to the whole
  day's title/notes/location or to deciding when athletes see it, only to
  their own groups' assignment rows.
- `POST /:id/assignments`, `PUT /assignments/:id`, `DELETE
  /assignments/:id` — `requireTeam` plus an inline
  `canManageGroupOrTeamWide(req, groupId)` check (same shape as T2's
  `canManageGroup` wrapper in `routes/groups.js`: `requireTeam` alone
  satisfies `routeAuth.test.js`, and the real gate is the inline call).
  `POST .../assignments` accepts an optional `templateId`; template
  fields are copied in first, then any body fields override them, so
  "insert from template, then tweak" is one call instead of two.
- `POST /:id/duplicate-day` and `POST /duplicate-week` — `HEAD_COACH`/
  `COACH`, always land **unpublished** regardless of the source plan's
  published state, per the doc, so a coach reviews before athletes see a
  copied day. `duplicate-week` only copies days that actually have a
  `PracticePlan` row in the source week — a partially-planned week stays
  partially planned in the copy, it doesn't get padded with empty days.

The team-wide-vs-group-scoped distinction (a volunteer coach can never
touch a `groupId: null` row, no matter what) is real enough to need its
own decision function rather than living inline in the route:
`decideCanManagePracticePlanRow` in `lib/groupPermissions.js`, which
collapses to "owner or active HEAD_COACH/COACH only" when `groupId` is
null and otherwise defers to T2's `decideCanManageGroup`. Five new cases
added to `test/groupPermissions.test.js` covering both branches
(team-wide allowed for HEAD_COACH/COACH and the owner, team-wide denied
for a VOLUNTEER_COACH even when `isGroupLeader` is true, group-scoped
falling through correctly in both directions).

`routes/workoutTemplates.js` — `GET /` (list active, any staff role),
`POST /` and `PUT /:id` (`HEAD_COACH`/`COACH`; `PUT` doubles as
archive via `archived: true`), and `POST /from-assignment/:assignmentId`
("save as template" — copies an existing assignment's fields into a new
named template, same copy-not-reference rule as the reverse direction).

Both route files mounted in `server.js` (`/api/practice-plans`,
`/api/workout-templates`). Full suite: 69 tests green, including
`routeAuth.test.js` confirming every new non-GET route still carries a
real authorization guard beyond `authenticate`.

Frontend (coach composer week view, insert/duplicate/publish actions,
athlete "today's plan" view) is T3's remaining half — next up.

### T3: coach composer + athlete "today's plan" view (frontend) — closes T3

`PracticePlansPage.tsx` (`/t/:athleticTeamId/practice-plans`, nav item
under "Manage", gated by the same `isCoach` hint as Coaches Tools/Data
Management — athletes can't call `GET /practice-plans` at all server-side,
so unlike Groups this one isn't shown to everyone). Week-at-a-glance:
four-up card grid, one card per day, assignment rows grouped by the group
they target ("Whole Team" for `groupId: null`). Per-day actions: "Add"
(opens a dialog — pick a group or Whole Team, optionally start from a
template which client-side-prefills the rest of the form, then
focus/volume/duration/distance/strength/details), "Details" (title,
start time, location, team-wide notes — saved via the same
`POST /practice-plans` upsert the "Add" flow uses to create the day's
shell on first use, so there's no separate "create day" step the coach
has to remember), "Publish"/"Unpublish", and "Duplicate" (single day,
always lands as a draft). A top-level "Duplicate week" picks a target
week-start and copies every day that actually has a plan, matching the
backend's "a partially-planned week stays partially planned" behavior.
Each assignment row also has a bookmark icon that opens "save as
template" (`POST /workout-templates/from-assignment/:id`) — same
copy-not-reference contract as inserting from a template in the other
direction.

One real gap, flagged rather than papered over: the composer doesn't know
a signed-in user's exact `TeamRole` (only the team-agnostic `role: 'coach'`
hint), so the "which group" picker in the Add dialog lists every training
group regardless of who's asking. A volunteer coach only ever *sees*
cards for groups they lead or team-wide rows (`GET /practice-plans`
already filters that server-side), so in practice they'd only be adding
into sections that are already theirs — but if one manually picked a
group they don't lead from the dropdown, they'd get a clear 403 toast
from the real gate (`decideCanManagePracticePlanRow`) rather than a
silently-filtered option list. Server-side enforcement doesn't depend on
the client getting this right either way; noted as a UX rough edge, not a
security gap.

Also fixed a real pre-existing bug this surfaced: `req.user.role` (the
sticky, team-agnostic UX hint the frontend uses for `isCoach` nav gating)
was only ever promoted to `'coach'` for a team's *owner* — a `COACH` or
`VOLUNTEER_COACH` who joined via a staff invite (T1) kept `role:
'athlete'` forever, which silently hid Coaches Tools, Data Management,
Feedback, and now Practice Plans from every real member of the coaching
staff who isn't the head coach. `middleware/auth.js`'s `authenticate`
now also promotes the hint on first sight of an active
HEAD_COACH/COACH/VOLUNTEER_COACH `TeamMember` row, same one-time-persist
pattern as the existing owner case. Still just a hint — every actual
authorization decision was, and remains, `requireRole`/`TeamMember.role`
server-side; this only fixes what staff can *see* a link for.

Athlete side: rather than a new nav item, "Today's practice" is a card at
the top of `MyProgressPage.tsx` (already the athlete's one-tap-from-nav
landing page) — title/time/location, team-wide notes, and each visible
assignment's focus/duration/distance/strength/details, sourced from
`GET /practice-plans/mine?date=<today>`. Minimal by design: no group
name, no other groups' rows, nothing unpublished — exactly what the
backend already filters to (team-wide plus the athlete's own current
`TRAINING` group via `getGroupOn`), so the frontend doesn't re-derive
scoping the backend already got right.

**Verification, and its limits (same shape as T2's)**: `tsc -b` and
`vite build` both clean. Headless-browser check against
`/t/:id/practice-plans` and `/t/:id/me` confirmed no client-side crash —
both correctly redirect to the sign-in UI unauthenticated (the same
`ERR_CONNECTION_RESET` on the underlying API calls as every prior
headless check in this sandbox, not a code issue). Not verified: the
actual composer/publish/duplicate flow against real data, which needs a
live session with a real team, season, and groups.

This closes T3.

### T4: Meet/MeetEntry/MeetPlan schema + meet mapping proposal script (backend)

Added the `Meet` parent entity the schema had been missing ("the current
schema has Race but no parent"): `Meet` (team+season scoped, one row per
meet day), `EntryStatus` enum, `MeetEntry` (per race, per athlete —
status/seed time/bib/notes, `@@unique([raceId, athleteId])`), and
`MeetPlan` (one row per meet — departure/return time, transport/uniform
notes, a free-form `itinerary` JSON list, `published`). `Race.meetId` is
a new nullable FK (`onDelete: SetNull`) — existing scraped races aren't
backfilled by the migration itself; grouping them is a coach-reviewed
proposal, same shape as Course mapping (Build Spec Phase 2 step 2):
`lib/meetMapping.js`'s `buildMeetMappingProposal` groups races by an
*exact* `(teamId, seasonId, date)` match only — a team can't be at two
meets on the same day, so unlike Course mapping this doesn't even need a
fuzzy-vs-exact distinction, just the one true signal — and proposes a
shared name by stripping a trailing "- Boys/Girls Varsity/JV/Frosh"
suffix so "Sunfair Invite - Boys Varsity" and "... - Girls JV" propose
one meet, not two. `scripts/proposeMeetMapping.js` (read-only, writes a
review file) / `scripts/applyMeetMapping.js` (only processes
`decision: "confirmed"` entries) mirror `propose/applyCourseMapping.js`
exactly. Races whose year has no matching `Season` row are reported
separately (`noSeason`) rather than guessed at. 5 new tests in
`test/meetMapping.test.js`.

**A genuine naming collision, not a duplicate concept**: `routes/meets.js`
already exists and is mounted at `/api/meets` — but it predates this
model and actually serves `Race` rows under the name "meets" for the
analytics `MeetsTab` (each Race presented as its own meet card, which is
exactly the "no parent" gap this section fills). Left it alone —
renaming that legacy endpoint isn't in scope here and nothing consumes
the real `Meet` model yet, so there's no live conflict, only a naming one
worth flagging. The real Meet entity's own routes (next task) will mount
under a distinct path (`/api/meet-ops`) to avoid it.

### T4: meet entry + meet plan routes (backend)

`routes/meetOps.js`, mounted at `/api/meet-ops` for the reason above.
Per `TeamRole`'s own doc comment ("COACH: paid assistant: full athlete
read/write, plans, **meet entry**"), this whole domain is head/paid-coach
territory — the doc never scopes any part of it to `VOLUNTEER_COACH` the
way T2/T3 explicitly do for groups, so `COACH_ROLES = ['HEAD_COACH',
'COACH']` gates every route here, reads included.

- `GET /` (list meets for a season), `POST /`, `GET/PUT /:meetId` — basic
  Meet CRUD. `POST /` covers an upcoming meet that hasn't been scraped
  yet and needs entries/logistics set up in advance of the mapping script
  ever seeing it.
- `GET /races/:raceId/entries` — the entry screen's data: every athlete
  on that race's season's *active* roster, each row carrying either their
  real `MeetEntry` or a synthesized (never persisted) `NOT_ENTERED`
  default with `seedTimeSec` pre-populated from their season-best
  (`lib/meetEntries.js`'s `seasonBestSec`, DB-free and unit-tested) —
  "nobody types 40 seed times." Also returns `enteredCount` and
  `entryCapWarning` (`decideEntryCapWarning`, also unit-tested per rule
  5): "most meets limit varsity to seven" is a single warning threshold
  applied uniformly, not a hard block and not a new per-race cap field —
  the doc doesn't specify one, and inventing a schema field for varsity-
  vs-JV caps wasn't asked for.
- `PUT /races/:raceId/entries` — bulk save, one transaction (same shape
  as T2's bulk group assignment), upserting on `(raceId, athleteId)`.
  Rejects athlete IDs outside the team and status values outside
  `EntryStatus` rather than trusting the client-supplied enum string
  straight into Prisma.
- `GET/PUT /:meetId/plan` — logistics upsert.
- `GET /mine` (`requireLinkedAthlete`) — the athlete meet card: the next
  upcoming `Meet` for their team, their own entry (always a real object —
  "a non-entered athlete sees that they are not entered rather than a
  blank screen" — never null), and logistics *only* once `MeetPlan.published`
  is true, same draft/publish gating as T3's practice plans. "What time is
  my race" deliberately isn't a new `Race.startTime` field — the doc's
  schema doesn't have one, and that kind of per-race timing belongs in
  `MeetPlan.itinerary`'s free-form `{time, label}` entries instead.
- `GET /:meetId/roster` — the coach-facing printable roster: ENTERED/
  ALTERNATE athletes grouped by race with bib numbers. The "blank column
  for hand-recorded splits" is a print-layout concern for the frontend;
  nothing new to store for it.

Full suite: 83 tests green, including `routeAuth.test.js` confirming
every new non-GET route carries a real guard.

Frontend (entry management screen reusing T2's bulk pattern, meet-day
logistics form, athlete meet card, printable roster) is next.

### T4: entry management + meet plan + athlete meet card (frontend) — closes T4

`MeetOpsPage.tsx` (`/t/:athleticTeamId/meets`, nav item "Meets" — same
`isCoach` gate as Practice Plans/Coaches Tools, since `GET /meet-ops`
requires HEAD_COACH/COACH server-side and an athlete can't call it at
all). Two-pane layout: a season-scoped meet list on the left ("New Meet"
dialog for one not yet scraped), and a detail pane on the right with
three tabs per selected meet:

- **Entries** — a race picker (a meet can have several races) plus a
  table of every athlete on that race's season's active roster: name,
  grade, season-best (read-only, for context), status (select, all seven
  `EntryStatus` values), seed time, bib, notes. Loads with seed times
  already pre-populated from season-best per athlete (server-side, see
  the backend entry above) and a red `entryCapWarning` banner when more
  than 7 are `ENTERED`. One "Save entries" button posts the whole table
  in one `PUT` call, same bulk-edit shape as T2's group assignment screen
  rather than a save-per-row loop.
- **Logistics** — the `MeetPlan` form (departure/return time, departure
  location, transport/uniform notes, bring list, and a small add/remove
  itinerary-row editor for the free-form `{time, label}` list), with
  separate "Save as draft" and "Publish" actions — mirrors T3's practice
  plan publish gating exactly, since the athlete-facing card below reads
  the same signal.
- **Printable roster** — entered/alternate athletes per race with bib
  numbers and a blank "Splits" column for hand-recorded times at the
  meet, plus a `window.print()` button. No new backend field for the
  blank column; it's just an empty `<td>` in the print layout.

Athlete side: rather than a new nav item, "Next meet" is a card on
`MyProgressPage` (same reasoning as T3's practice-plan card — the
athlete's existing one-tap landing page), sourced from `GET
/meet-ops/mine`. Always renders a real status line — "You're entered in
[race]," "You're an alternate," or "You're not entered in this meet" —
never a blank card for a non-entered athlete, matching the verify gate's
literal wording. Logistics (departure/return time, uniform, bring list,
itinerary) only render once `MeetPlan.published` is true; before that it
just says logistics haven't been posted yet.

**Verification, and its limits (same shape as T2/T3's)**: `tsc -b`
(forced, not incremental) and `vite build` both clean. Headless-browser
check against `/t/:id/meets` and `/t/:id/me` shows no client-side
crash — both correctly redirect to sign-in unauthenticated, same sandbox
network limits as every prior check in this file. Not verified: the
actual entry-save/publish/print flow against real data, which needs a
live session with a real team, season, and scraped races.

This closes T4. The doc's verify gate ("set entries for four races
across 130 athletes in under ten minutes... a non-entered athlete sees
that they are not entered rather than a blank screen") is
backend-provable for the "not entered" half (GET /meet-ops/mine always
returns a real entry object, never null) and UI-provable for the bulk-
save shape, but the actual ten-minutes-for-130-athletes timing needs a
human on a live team, same caveat as T2's five-minute gate.

### T5: RaceReflection schema + lock/visibility logic + routes (backend)

`RaceReflection` added exactly per the doc: pre-race fields
(processGoal/outcomeGoal/targetTimeSec/targetSplits/keyFocus,
`preSubmittedAt`), post-race fields (feelingRating/effortRating/
whatWorked/whatDidnt/postNotes, `postSubmittedAt`), and
`sharedWithCoach` (default `true`, matching paper). `targetSplits` is
kept deliberately distinct from `RaceSplit` (a coach's transcription of
what actually happened) — neither writes to the other; a future athlete
race page compares them, it doesn't merge them.

**The locking rule, and the honest reasoning behind it.** The doc says
"enforce server-side against race start time, falling back to earliest
recorded finish time if no start time exists." `Race` has no start-time
field anywhere in this schema — it was never specified for any phase —
so that fallback isn't a rare edge case here, it's the *only* rule that
will ever fire: `lib/raceReflections.js`'s `computeLockAt` takes the
earliest `Result.createdAt` across a race's results and treats that as
the lock instant; a race with zero results yet has no lock. This is a
real interpretive judgment call, not something the doc spelled out in
data-model terms, so flagging it plainly: `Result.createdAt` is *when
the row was inserted into this database* (import/data-entry time), not
a literal race-morning gun time — for a race whose results get entered
same-day this is a faithful proxy for "the race already happened"; for
one entered well after the fact it locks later than a purist reading of
"race start" would. Given the schema has no other signal to use, this
is the best available implementation of the doc's own stated rule, not
an invented substitute for it — worth a coach's eyes if the exact timing
ever matters at the margin. `isPreRaceLocked` is the pure now-vs-lockAt
comparison; both are unit-tested (rule 5) ahead of the route in
`test/raceReflections.test.js`.

**Visibility, as an explicit allowlist** (`decideCanViewReflection`,
same posture as T1's captain permission set — never "coach minus a few
things"): the owner always sees their own row regardless of the toggle;
an unshared reflection is invisible to everyone else, full stop;
HEAD_COACH/COACH see any shared reflection team-wide; VOLUNTEER_COACH
only for an athlete in a group they lead (checked via T2's `getGroupOn`
at the race's own date, so a mid-season group move is respected) *and*
only if shared; ATHLETE never sees another athlete's reflection under
any condition. A captain is still a plain `TeamRole.ATHLETE` — captaincy
is a `SeasonRoster` flag, not a role — so this single branch is what
makes "a captain returns 403 on every reflection endpoint" true for the
coach-facing surface without needing a captain-specific check anywhere:
`routes/raceReflections.js`'s `GET /race/:raceId` gates on
`requireRole(['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'])`, so an ATHLETE
account (captain or not) never even reaches the per-row filter — it 403s
at the route guard itself, the same structural guarantee
`test/requireRole.test.js` already proves for the middleware generally.

`routes/raceReflections.js`: `GET /mine/:raceId` and
`PUT /mine/:raceId/{pre-race,post-race,sharing}` are all
`requireLinkedAthlete`-scoped self-service (own row only, keyed off
`req.user.linkedAthlete.id` — never a client-supplied athleteId, same
pattern `test/captainPermissions.test.js` already established for
TrainingLog); `PUT .../pre-race` 403s with a plain-language message when
`raceLockState` reports locked, `PUT .../post-race` never checks the
lock, `PUT .../sharing` is available regardless of lock state since the
privacy toggle shouldn't itself be lockable. `GET /race/:raceId` is the
one coach-facing route, filtering every reflection for that race through
`decideCanViewReflection` before it's ever serialized into the response
— never returning an unshared/out-of-scope row and redacting it
client-side.

Full suite: 95 tests green, including `routeAuth.test.js` confirming
every new non-GET route is guarded.

Frontend (pre-race goal form with a visible lock message, post-race
reflection form with the sharing toggle, and a coach-side reflections
view) is next.

### T5: race reflection UI (frontend) — closes T5

Athlete side lives on `MyProgressPage.tsx` — no new nav item, same
reasoning as T3/T4's cards: it's already the athlete's one-tap landing
page. A new "Race goals & reflections" card lists their recent races
(reusing the same `getRecentRaces` fetch the pace calculator already
does); clicking one opens a dialog with the sharing toggle always
visible at the top ("Your coach can read this" / "Only you can read
this," in the doc's own plain-language wording) and two tabs. The
pre-race tab disables every input and shows a lock alert once
`GET /race-reflections/mine/:raceId` reports `locked: true` — the
lock is enforced server-side regardless of what this form does, this is
just honest UI, not the actual gate. The post-race tab never disables.

One small, additive backend change this surfaced: `GET
/athletes/:athleteId/races` (the existing endpoint the pace calculator
already calls) only ever returned `Result.id`, which reflections have
no use for — added a `raceId: r.race.id` field alongside the existing
ones rather than standing up a parallel endpoint. Purely additive; the
calculator only reads the fields it already read.

Coach side: rather than a new page, reflections got a fourth tab
("Reflections") on the existing `MeetOpsPage.tsx`, next to Entries/
Logistics/Printable roster — reflections are inherently per-race, and
that page already has the race picker this needed. Read-only cards per
athlete, sourced from `GET /race-reflections/race/:raceId`, which is
already filtered server-side to exactly what this viewer (head/paid
coach team-wide, or a volunteer coach's own led groups) is allowed to
see — the frontend never receives a row it shouldn't render, so there's
no client-side redaction logic to get wrong.

**A deliberate scope cut, flagged rather than silently skipped**:
`targetSplits` (`[{ markerMeters, elapsedSec }]`) has no editor in this
pass — the doc specifies the field but no UI for it, and a proper
mile-marker/split-time list editor felt disproportionate to build
speculatively before any athlete has asked for split-level goals versus
a single target time. The field round-trips fine through the API if a
future pass wants to fill it in.

**Verification, and its limits (same shape as T2/T3/T4's)**: `tsc -b`
(forced) and `vite build` both clean; the backend suite still shows 95
green after the `routes/athletes.js` addition. Headless-browser check
against `/t/:id/meets` and `/t/:id/me` shows no client-side crash — both
correctly redirect to sign-in unauthenticated, same sandbox network
limits noted throughout this file. Not verified: the actual lock-at-
race-start behavior against a real race with real results, or the
captain-403 property end-to-end (both are unit-tested at the permission-
logic layer in `test/raceReflections.test.js`, and the 403 is additionally
structurally guaranteed by `requireRole` never listing ATHLETE for the
coach-facing route — but neither was exercised against a live session).

This closes T5.

### T6: Equipment/EquipmentAssignment schema + routes (backend)

Added exactly per the doc: `EquipmentType`/`EquipmentCondition` enums,
`Equipment` (`@@unique([teamId, type, identifier])`), and
`EquipmentAssignment` — "an item is out when an assignment row exists
with `returnedAt` null." That invariant gets a real database guarantee,
not just an application-level check: a **partial unique index**
(`CREATE UNIQUE INDEX ... ON equipment_assignments(equipment_id) WHERE
returned_at IS NULL`) in the migration SQL, since Prisma's schema
language has no way to express a `WHERE` clause on an `@@index`/
`@@unique` — the `EquipmentAssignment` model comment points at the
migration file so this doesn't get "cleaned up" later by someone who
doesn't know it's there. `routes/equipment.js` still does the
application-level check first (so the common case gets a message naming
the current holder, not a raw constraint-violation error), and falls
back to catching the DB-level `P2002` for the genuine race — two coaches
checking out the same item in the same second.

Every route is `HEAD_COACH`/`COACH` only — same reasoning as T4's meet
operations: the doc never scopes any part of equipment to
`VOLUNTEER_COACH`.

- `POST /checkout` is the "type-and-enter flow" itself: `{type,
  identifier, athleteId, seasonId, ...}` in one call. It **upserts** the
  `Equipment` row by `(teamId, type, identifier)` rather than requiring
  a separate "add to inventory" step first — a coach checking out jersey
  #14 for the first time this season shouldn't need to go create #14 as
  a database row before they can hand it to someone. `POST /` still
  exists for pre-seeding inventory (sizes, condition) ahead of time,
  it's just not required.
- `POST /assignments/:assignmentId/return` — sets `returnedAt`,
  `returnedById`, optional `conditionIn`.
- `GET /outstanding?seasonId=` — the season-end report the doc says
  justifies the whole build: every unreturned item, grouped by athlete.
- `PUT /:id` — edit condition/size/notes, or retire an item (`retired:
  true` — `POST /checkout` refuses to check out a retired item).

Full suite: 95 tests green (no new pure-logic file this time — unlike
T2/T3/T5, there wasn't a real arithmetic/permission decision to extract;
"is there already an active assignment for this item" is a
straightforward existence check against the DB, not a rule worth a
DB-free unit test on its own). `routeAuth.test.js` still confirms every
new non-GET route is guarded.

Frontend (the type-and-enter bulk checkout screen, return flow, and the
outstanding report) is next.

### T6: equipment checkout UI (frontend) — closes T6

`EquipmentPage.tsx` (`/t/:athleticTeamId/equipment`, nav item gated the
same `isCoach` way as Practice Plans/Meets/Coaches Tools — the backend
is `HEAD_COACH`/`COACH` only). Three tabs:

- **Checkout** — the type-and-enter flow itself: a persistent Type
  select, an athlete picker, and an identifier field with a ref so
  focus returns to it after each submission (React 19 lets a plain
  function component accept `ref` as a normal prop now, so `ui/input.tsx`
  needed no `forwardRef` wrapper change to support this — first time this
  codebase has passed a ref through it, worth noting since it's a newer
  pattern than the rest of the UI kit uses). On success the identifier
  (and athlete, since the next scan is usually someone else) clear and
  refocus immediately — "not a modal per item," per the doc. A 409 from
  an already-checked-out item surfaces the backend's own message naming
  the current holder directly via toast, no re-derivation on the client.
- **Outstanding report** — grouped by athlete exactly as
  `GET /equipment/outstanding` already returns it, each item with a
  one-click "Mark returned" (posts with no `conditionIn`/notes — a
  fuller return form with condition-in tracking would be a reasonable
  next increment, not built here since the verify gate only requires the
  report to be accurate, not the return flow to capture condition).
- **Inventory** — a flat list with inline condition edit and a
  retire/un-retire toggle per item. No standalone "add new item" dialog
  — checkout itself creates the `Equipment` row on first use (see the
  backend commit), so this tab is for adjusting condition/retiring
  existing items, not seeding new ones from scratch.

**Verification, and its limits (same shape as every prior phase's)**:
`tsc -b` (forced) and `vite build` both clean; backend suite still 95
green. Headless-browser check against `/t/:id/equipment` shows no
client-side crash — redirects to sign-in unauthenticated, same sandbox
network limits noted throughout this file. Not verified: the actual
"check out 40 uniforms in under five minutes" timing, or the DB-level
partial-unique-index race-condition guard, both of which need a live
session against a real database (Postgres, which this sandbox has never
had access to) rather than something a headless check without a backend
can exercise.

This closes T6 — the last phase in the handoff doc's P0 → T6 build
order. The doc's own "Cleanup, alongside the phases above" list (delete
`web/src/_archive/`, duplicate `RaceVisualization.tsx`/
`SeasonModeSelector.tsx`, consolidate the three formatter modules and
two api modules, rename `calculationServiceSupabase.js`, move
`docs/history/`) and its six "ask before building" open questions
(attendance, communication/announcements, preseason time trials,
multi-team support — injury tracking and guardian access were already
resolved and built as part of T1/T4) remain the only unbuilt items from
this document.

### Post-T6: captain-designation UI (closing a T1-era gap)

Asked directly: "how do I elevate a student to captain without them
having to log in?" The honest answer was that the backend had supported
this since T1 (`PATCH /api/seasons/:id/roster/:athleteId`, coach-only,
entirely server-side — an athlete's `TeamRole` stays `ATHLETE` and they
never see a prompt of any kind) but no button existed for it anywhere.
The T1c entry in this file flagged that gap at the time and it sat
unaddressed until now.

Closed it: `GET /api/athletes` (`routes/athletes.js`) already loaded
each athlete's `SeasonRoster` row for other fields (grade, active
status) — added `isCaptain`, `captainNotes`, and `seasonId` to its
response purely additively, so the roster screen doesn't need a second
request just to know which season it's looking at. `RosterPage.tsx` gets
a "Make Captain"/"Remove Captain" toggle per athlete (coach-only, same
`isCoach` gating as every other roster action) plus a "Captain" badge
next to their name, and a small notes dialog for the optional
`captainNotes` field. Toggling calls the existing T1 endpoint directly —
no new backend route needed, just the missing UI on top of it.

`tsc -b` (forced) and `vite build` both clean; backend suite still 95
green (this was an additive field on an already-untested-at-the-field-
level route, not new logic — nothing here is arithmetic or a permission
decision, it's a pass-through toggle of an existing field, so no new
unit test was added per rule 5's actual scope). Headless-browser check
on `/t/:id/roster` shows no client-side crash.

### Cleanup list, from the handoff doc's "Cleanup, alongside the phases above"

`web/src/_archive/` was already gone by the time this ran — nothing to
do there. The rest, one at a time, each verified rather than assumed:

- **Duplicate `RaceVisualization.tsx`**: `components/RaceVisualization.tsx`
  (root) was never imported anywhere — confirmed by grep, not assumed —
  while `components/analytics/RaceVisualization.tsx` is the real one
  `AnalyticsPage.tsx` renders. Deleted the dead one; nothing to migrate,
  they'd already diverged into different prop shapes.
- **Duplicate `SeasonModeSelector.tsx`**: unlike the above, both copies
  were actually live — `components/analytics/SeasonModeSelector.tsx`
  (used by `AnalyticsHeader.tsx`) and `components/SeasonModeSelector.tsx`
  (used by `TeamAthleteProfilePage.tsx`) — with genuinely different prop
  APIs (`mode` vs `currentMode`, plus two props on the root-level one,
  `selectedSeason`/`onSeasonChange`, that its own code comment admitted
  were accepted but never used). Kept the analytics version as canonical
  (it's the more current implementation — its own comment describes
  deduplicating a previously-doubled season picker) and updated
  `TeamAthleteProfilePage.tsx`'s call site to match its real prop names,
  dropping the two dead props rather than carrying them forward. The
  root-level file also exported an unused `SeasonSelector` component
  (built on `hooks/useSeasons.ts`, itself flagged as partly dead back in
  the T2 notes) — confirmed zero imports before deleting it as part of
  the same file.
- **Three formatter modules** (`lib/formatters.ts`, `lib/formatUtils.ts`,
  `utils/formatters.ts`): audited every import site before touching
  anything — `formatUtils.ts` had 17 consumers (the entire analytics
  module), `formatters.ts` had 3, `utils/formatters.ts` had 1, and one
  file (`MyProgressPage.tsx`) was already importing from *two* of the
  three in the same file, which is exactly the fragmentation the doc's
  talking about. Kept `formatUtils.ts` as canonical since moving the
  minority onto the majority is the lower-risk direction; added the one
  missing function it didn't have (`parseTimeToSeconds`) rather than
  losing it. `utils/formatters.ts` additionally exported
  `formatDistance`/`formatPercentage`/`formatDate`/`formatNumber` — grepped
  for each and confirmed none were imported anywhere, so those were
  simply dropped, not migrated; nothing used them. The behavioral edge
  case worth flagging: `formatUtils.ts`'s `formatTime`/`formatPace`
  render `'0:00.0'`/`'0:00/mi'` for zero-or-negative input, while the two
  deleted modules mostly returned `'-'` for null/NaN — every call site
  that switched formatters was checked and either already guards its
  input with a ternary/truthiness check, or only ever passes a computed
  positive number, so this is a real (if narrow) behavior change only in
  the theoretical case of a genuinely zero-second value reaching one of
  these calls — and it makes the switched call sites *consistent* with
  the 17 screens already using this convention, not inconsistent with
  them.
  **Found but deliberately NOT touched**: `lib/utils.ts` (the shadcn
  `cn()` utility file) also has its own `formatTime`/`formatPace`/
  `formatDateShort`, used by `TeamPerformanceView.tsx`/
  `TeamPerformanceCard.tsx` — a fourth copy the doc's cleanup list didn't
  name. Its `formatTime` does real HH:MM:SS hour-rollover (the other
  version doesn't) and its `formatPace` takes a `unit: 'mile'|'km'`
  parameter the other version doesn't have, so consolidating it isn't a
  drop-in replacement the way the other three were — flagging it here
  per rule 2 rather than expanding scope into a riskier edit that wasn't
  asked for.
- **`lib/api.ts` vs `api/api.ts`**: not actually a duplication of the
  same thing — `api/api.ts` is the real, live axios client re-export;
  `lib/api.ts` was leftover mock-data scaffolding from early development
  (`getAnalytics`/`getSeasons`, both literally commented "In a real
  implementation, this would be an actual API call" and returning
  hardcoded fake data). Confirmed zero imports, deleted outright — there
  was nothing real to merge.
- **`calculationServiceSupabase.js` → `calculationService.js`**: pure
  rename, no behavior change. Already ran against Prisma/Neon internally
  (`require('../../lib/db')`) — only the filename and three `require()`
  call sites (`routes/teams.js`, `routes/enhancedPerformanceRoutes.js`,
  `routes/performanceRoutes.js`) plus one explanatory comment still said
  "Supabase."
- **`docs/history/`**: deleted (the doc offered move-or-delete; these
  were ~29 stale AI-development-session status notes — `URGENT_FIX_
  NEEDED.md`, `WORKING_NOW.md`, and similar — not documentation anyone
  currently needs, confirmed by checking that nothing in the live app or
  build referenced the directory). **Found something worth flagging
  while checking references first**: `docs/history/RAILWAY_ENV_VARS.md`
  had a real-looking Supabase anon key and a plaintext
  `COACH_UPGRADE_CODE=runnderland` secret committed in it —
  `MIGRATION_STATUS.md` had already caught and documented both back at
  the start of this migration. Verified before deleting, not assumed:
  `COACH_UPGRADE_CODE` is dead code now (grepped — the only remaining
  reference anywhere is a comment in `routes/profile.js` explaining that
  T1 retired the whole upgrade-to-coach-by-code flow in favor of staff
  invites), and the Supabase project itself is confirmed gone per
  `MIGRATION_STATUS.md`, so neither secret is live-exploitable through
  this app today. Deleting the file removes it from the tree going
  forward; it does **not** remove it from git history, and rewriting git
  history is a destructive action nobody asked for and this pass didn't
  do — if either credential could still matter anywhere outside this
  app, that's still worth an explicit rotation/history-scrub decision
  from a human, not something to silently attempt here. Updated
  `README.md`'s project-structure tree, which pointed at the
  now-deleted path.

Verified across all of the above: `tsc -b` (forced) and `vite build`
both clean, backend suite 95 green, headless-browser check against
`/t/:id/roster`, `/t/:id/analytics`, `/t/:id/tools`, and
`/t/:id/team/athlete/:id` (the four screens this pass actually touched)
shows no client-side crash on any of them.

This closes every item on the handoff doc's cleanup list except the one
flagged as deliberately deferred (`lib/utils.ts`'s formatter functions).

### Post-cleanup: real usage feedback, five items

The user actually used the built T2–T6 screens and reported five gaps.
Each investigated against the real code before touching anything.

**#4 fixed: athlete profile required season analytics to exist first.**
`TeamAthleteProfilePage.tsx` fetched `GET /performance/athlete/:id/season/:season`
for *everything*, including the header — and that route 404s until a
coach runs the team's season-wide metrics calculation, which a brand-new
2026 preseason athlete (or honestly most athletes most of the time)
never has yet. The whole page fell through to a "Metrics haven't been
calculated" block-screen, hiding even the athlete's name. Fixed by
pulling the header (name/grade/gender) from `GET /athletes/:athleteId`
instead — an endpoint that always 200s, since identity doesn't depend on
computed analytics — and narrowing the "calculate metrics first" gate to
just the stats/charts section (`AthleteDetailModal`), which genuinely
does need computed metrics. `athleteService.getAthlete` (which already
existed, hitting the same endpoint) got an optional `season` param
rather than adding a second function that does the same thing.

**Found but deliberately not touched while investigating #4**: the
`enhancedAthlete` `useMemo` derivation reads `data.metrics?.best?.bestTime`,
`data.metrics?.current?.avgMilePace?.overall`, and `data.athleteName` —
but the real `AthleteSeasonMetrics` row (and this route's response) is
flat (`data.bestTime5k`, `data.averagePace`, `data.name`, no nested
`.metrics` key at all). That means every stat `AthleteDetailModal`
renders from this path is silently falling back to its `|| 0` / `|| ''`
default, regardless of whether metrics were actually calculated. This is
a real, separate, pre-existing bug — not something introduced by this
fix — and it's a deeper one (touches the shape `AthleteDetailModal`
expects, which several other callers may also share). Flagging it here
rather than fixing it blind; it needs its own pass.

**#1/#2/#3 fixed: Groups — could create but never edit/delete a group,
never create a Captain-type group, never add coaches as leaders, and
"Unassign" silently did nothing.** All the backend routes for this
(`PUT /groups/:id`, `DELETE /groups/:id`, `POST`/`DELETE
/groups/:id/leaders/:userId`) were built and tested back in T2 — the
frontend just never grew the UI to call them. Investigated before
building anything, not assumed:

- **A real backend gap found along the way**: there was no way to take
  an athlete OUT of a group with nothing replacing it.
  `moveAthleteToGroup` (T2) only ever moves someone INTO a group, closing
  whatever they were in before as a side effect — there was no
  close-with-no-replacement operation. That's exactly what "Unassign" in
  the bulk screen needs, and its absence is why `GroupsPage.tsx`'s old
  `handleSave` **silently filtered `UNASSIGNED` entries out before
  sending the request** — setting someone to Unassigned and clicking Save
  did nothing at all, with no error, which is indistinguishable from a
  bug. Added `removeAthleteFromGroup` to `lib/groups.js` (closes the
  athlete's active membership in that specific group, creates no new
  row — the "Never hard-delete a membership. Removal sets endDate" half
  of the doc's own rule that T2 never actually built) plus
  `DELETE /api/groups/:id/members/:athleteId`, unit-tested per rule 5.
  `GroupsPage.tsx`'s save now actually calls this for every athlete moved
  to Unassigned, instead of dropping the change.
- **New Group dialog** gained a Type select (Training/Captain/Custom —
  previously hardcoded to `'TRAINING'`) and a Gender select that now
  includes "Mixed / not split" (`null`), since a captain or custom group
  isn't necessarily gender-split the way training groups are.
- **Every group card** (training columns and the new "Captain & Custom
  Groups" section below them) got edit (rename), archive/restore, delete,
  and a "manage leaders" action. Archived training groups previously just
  vanished with no way back — added a small "Archived" list per gender
  column with a Restore button.
- **"Add existing coaches to a group"** is what "manage leaders" is:
  `ManageLeadersDialog` lists a group's current leaders (with a Primary
  badge) and a picker (sourced from `GET /team/staff`, filtered to active
  staff) to add another. `teamService.getStaff` and
  `groupService.assignLeader`/`removeLeader` are new; the backend route
  was already there.
- **CAPTAIN/CUSTOM groups have no natural home in the two-column
  TRAINING bulk-assign UI** — a captain-group membership runs concurrently
  with a training-group one (per T2's own effective-dating rules,
  `GroupMembership` is scoped "at most one active per `GroupType`", not
  globally), so the checkbox-and-assign flow doesn't apply to them at all.
  Built a separate `ManageMembersDialog` for these — a plain add/remove
  list per group, using the new `removeAthleteFromGroup` for removal and
  the existing single-athlete `POST /:id/members` for adding.

`tsc -b` (forced), `vite build`, and the backend suite (97 green,
including 2 new `removeAthleteFromGroup` tests and `routeAuth.test.js`
confirming the new `DELETE` route is guarded) all clean. Headless-browser
check on `/t/:id/groups` shows no client-side crash. Not verified: the
actual click-through flows against real data (add a coach as a leader,
move an athlete into a captain group, restore an archived group) — same
live-session caveat noted throughout this file for every prior UI pass.

**#5 fixed: no way to get a season's meets into the app short of shell
access.** T4 built `Meet` rows and the propose/apply grouping logic
(`lib/meetMapping.js`), but the only thing that ever called it was two
CLI-only scripts (`scripts/proposeMeetMapping.js` /
`applyMeetMapping.js`) — reasonable for a one-time backfill during
development, useless for a coach who just wants this season's races to
show up as meets so entries/logistics/reflections have something to
attach to. Exposed the same grouping logic as two routes in
`routes/meetOps.js`: `GET /import/propose?seasonId=` (read-only — groups
that season's races with no `Meet` yet by the same exact
(team, season, date) match, returns the proposal, writes nothing) and
`POST /import` (creates a `Meet` per confirmed entry and links its
races — only ever acts on what was actually confirmed, never re-derives
groupings itself). No new logic to unit-test here; both routes are thin
wrappers around the already-tested `buildMeetMappingProposal`.

`MeetOpsPage.tsx` got an "Import from races" button next to "New Meet."
The dialog proposes on open, shows each grouped meet with an editable
name, date, location, and the race names/count that would be linked,
with a checkbox to include/exclude each one (all checked by default) —
a coach reviews and can rename before anything is created, matching the
doc's own "never auto-merge, a coach confirms" posture for this exact
kind of grouping decision (same one Course mapping and the CLI meet
scripts already follow). Confirming calls the import route and selects
the first newly-created meet.

`tsc -b` (forced), `vite build`, and the backend suite (97 green,
`routeAuth.test.js` confirming the new `POST` route is guarded) all
clean. Headless-browser check on `/t/:id/meets` shows no client-side
crash. Not verified: the actual propose-then-import flow against real
scraped race data, or that the grouping produces sensible results for
this specific team's real meet names — same live-session caveat as
everything else in this file.

## Groups page showing zero athletes (real user report, live 2026 team)

After the Groups CRUD/leader/membership fixes above, the coach sent a
screenshot of their live Groups page: every column — Boys, Girls, and
"Unassigned" — showed 0 athletes and "No athletes," even though the same
team's Roster page (same 2026 season) correctly listed everyone. Asked
directly via `AskUserQuestion` whether Roster shows athletes for 2026 —
confirmed yes — which ruled out a shared visibility bug (`isEnrolled`/
`deriveGrade` in `lib/season.js`) and narrowed it to something specific to
Groups.

**Root cause.** `GroupsPage.tsx` buckets athletes into the Boys/Girls
columns with `athletes.filter((a) => a.gender === gender)` iterating over
`(['M', 'F'] as const)` — an exact-match check. `Athlete.gender` is free
text, though, and multiple write paths never normalized it:

- The Athletic.net roster-scrape sync (`routes/teams.js`, the
  `/scrape-roster`-style import loop) wrote whatever the scraped `Gender`
  column contained straight onto the athlete record.
- The coach-uploaded CSV roster-sync import (`routes/teams.js` ~line 476,
  a separate code path from the scrape sync) did the same:
  `const gender = row.Gender || null;`, written on both create and update
  with no validation.
- `services/performance/calculationService.js:113` already had its own
  local `'Men'/'Women'` → `'M'/'F'` ternary — proof this codebase's real
  data contains values other than exactly `'M'`/`'F'` (a CSV export or a
  hand-typed roster column reading "Men"/"Women" rather than "M"/"F" is
  enough to trigger it), and `routes/analytics.js` separately had its own
  ad hoc `normalizeGender` for the same reason. Neither of those covered
  Groups.

Roster page wasn't affected because it groups by grade, not gender, so it
never touched the broken field. Any athlete whose stored `gender` wasn't
exactly `'M'` or `'F'` was invisible in every Groups column on every team
that had ever gone through the CSV import or the scrape sync with
non-canonical gender text — not just this user's team, just the first one
where a coach actually looked.

**Fix.** Added `lib/gender.js` — a single `normalizeGender(value)` that
maps common variants (`m/male/men/boy/boys` → `'M'`, `f/female/women/
girl/girls` → `'F'`, case/whitespace-insensitive) and returns `null` for
anything else, never guessing. Unit-tested in `test/gender.test.js`
(exact values, known variants, case/whitespace, and the "don't guess"
case for genuinely unknown/missing values). Wired in at both ends:

- **Write-time** (`routes/teams.js`, both the scrape-sync and CSV-import
  athlete create/update blocks) — new imports and syncs write canonical
  `'M'`/`'F'`/`null` going forward.
- **Read-time** (`routes/athletes.js` `GET /` and `GET /:athleteId`,
  `routes/groups.js` `GET /` group list, `GET /:id/members`, and `POST /`
  group create) — every already-written value, however it got there, is
  normalized before it reaches the frontend. This was the piece that
  actually unblocks the live bug without needing a data migration: the
  coach's existing (unmodified) database rows show up correctly the next
  time the page loads, no backfill required. `POST /athletes` and
  `PUT /athletes/:id` (manual add/edit) also normalize on write, since a
  free-text `gender` field in a request body is no different from a CSV
  column.

Deliberately did NOT touch the DB rows themselves (no backfill script, no
migration) — normalizing on every read path makes the display correct
immediately, and normalizing on every write path stops new bad data from
being created, so a backfill would only matter for a direct DB query
bypassing the API, which nothing in this app does. Also deliberately left
`routes/coachesTools.js` and `routes/enhancedPerformanceRoutes.js` alone —
they already do their own inclusive array-membership checks
(`['M','Male','Boys','Men'].includes(...)`) for boys/girls splits, so
they were never affected by this bug; consolidating them onto the new
shared helper would be a pure refactor with no behavior change, out of
scope for a bug fix.

Verification: `node --check` on every touched file, backend suite 96/97
green (the 1 failure is `scraper.test.js`'s pre-existing Playwright
browser-binary gap in this sandbox, unrelated — same known limitation as
every prior session). No frontend files changed, so no `tsc`/`vite build`
re-run needed this time — `GroupsPage.tsx`'s gender comparisons were
already correct, they just needed the data reaching them to be honest.

## Import a team's season schedule from Athletic.net (preseason + midseason)

User request: pull in the meet schedule for the current season directly
from Athletic.net, ahead of any results being scraped — needed so race
plans and journals have something to attach to before a single result
exists (preseason), and to pick up schedule changes mid-season. User also
flagged, correctly, that this needed real thought around duplicates: not
just "don't create the same meet name twice within a team," but "many
different XCApp teams go to the same invitational — we shouldn't end up
with 20 near-duplicate rows for one physical event."

**Finding the actual source.** The team's Athletic.net homepage
(`/team/{id}/cross-country/{year}`) turned out to be an Angular SPA — its
page source is just an empty `<anet-site-app>` shell, the schedule loads
client-side afterward. A copied cURL of the underlying API call didn't
replay outside the browser (session/fingerprint-bound, as expected). The
actual answer came from the page's own "Download options ▾" menu: it
exposes `https://www.athletic.net/CrossCountry/Print/ical.ashx?SchoolID=
&S=` — a plain, unauthenticated iCal (.ics) feed meant for calendar-app
subscriptions (Google Calendar, Apple Calendar, etc.), so by design it's a
simple public GET, no login, no Angular rendering, no bot-detection
issues the way the HTML pages have. Confirmed reachable with a plain
`fetch`/curl from this environment — no Playwright needed for this one,
unlike the roster/season scrapers.

The feed mixes real meets with calendar-only entries ("First Day of
Practice," a "District Meet Placeholder" with no actual meet behind it).
Real meets carry a `DESCRIPTION` line with the direct meet URL
(`.../CrossCountry/meet/271958`) — that trailing number is Athletic.net's
own meet ID, the same value `Race.athleticMeetId` already stores from
results scraping. Placeholder entries have no `DESCRIPTION`/`LOCATION` at
all, which is what makes filtering them out unambiguous rather than a
guess based on the name text.

**Duplicate strategy (the user's actual question).** Two different
problems, two different answers, worked out with the user before writing
code:

1. *Within one team*, re-running this import (preseason, then again
   mid-season) must not create a second row for a meet it already
   imported. Fixed by keying `Meet` on Athletic.net's own meet ID —
   added `Meet.athleticMeetId` (nullable, so hand-created meets with no
   Athletic.net counterpart never collide with each other) with a
   `@@unique([teamId, seasonId, athleticMeetId])` constraint
   (`prisma/migrations/20260812010000_meet_athletic_id`). Confirming an
   import is an upsert on that key, not a blind create.
2. *Across teams*, `Meet` was already `teamId`-scoped, so 20 different
   XCApp teams at the same invitational already get 20 separate rows
   today — deliberately NOT changed. That's normal multi-tenancy: each
   team's plan (departure time, transport notes, entries, roster) is
   inherently team-specific and has to stay separate regardless of how
   many other teams share the physical event. Building a shared
   "canonical meet" entity would be a real schema change (a shared meet +
   a per-team sub-plan) with no feature yet that needs it — deliberately
   out of scope. What *is* in scope, and done: `Meet` now captures
   Athletic.net's meet ID the same way `Race` does, so a future cross-team
   feature has the join key already sitting there if it's ever built.

**What got built.**
- `lib/icalMeets.js` — pure `parseTeamCalendar(icsText)`: unfolds RFC 5545
  line-folding (CRLF + one leading space/tab), unescapes `\,`/`\;`/`\\`/
  `\n`, and returns only VEVENTs with a real meet link
  (`{uid, athleticMeetId, name, date, location}`). Unit-tested
  (`test/icalMeets.test.js`) against `test/fixtures/team-calendar-2026.ics`
  — the actual feed for a real team (Ellensburg HS, SchoolID 460),
  captured live during this conversation, not a synthetic fixture. 7
  tests: real-meet extraction, placeholder exclusion, meet ID extraction,
  date conversion, location capture, UID capture, line-fold handling, and
  an empty-feed edge case.
- `routes/meetOps.js`: `GET /import/propose-calendar?seasonId=` — looks up
  the team's `athleticTeamId`, fetches
  `.../ical.ashx?SchoolID=&S=`, parses it, and flags each proposed meet
  with `alreadyImported` (a Meet already exists for that Athletic.net ID)
  and `unlinkedRaceCount` (races already scraped for that meet ID but not
  yet linked to any Meet — so the coach can see up front that confirming
  will attach existing results, not just create a bare shell). Read-only,
  same "propose then a coach confirms" posture as every other import path
  in this app. `POST /import-calendar` — upserts a `Meet` per confirmed
  entry keyed on `(teamId, seasonId, athleticMeetId)`, then links any
  already-scraped, still-unlinked `Race` rows sharing that same
  `athleticMeetId`.
- Closed the reverse gap too: the existing race-based `POST /import` (the
  T4-era "group already-scraped races into a meet" flow) used to always
  `create` a new `Meet` unconditionally. If a coach ran the calendar
  import first (creating a Meet with an Athletic.net ID) and later
  scraped results before re-running the calendar import, the race-based
  flow would have created a second, ID-less `Meet` for the same real
  event — exactly the duplicate the user was worried about, just via the
  other import path. Fixed: it now looks up the Athletic.net meet ID
  shared by the races being grouped and `upsert`s against the same
  `(teamId, seasonId, athleticMeetId)` key when one exists, only falling
  back to a plain `create` when the races carry no ID (older scraped data
  from before `Race.athleticMeetId` existed).
- Frontend: `meetOpsService.ts` (`ProposedCalendarMeet`,
  `proposeCalendarImport`, `confirmCalendarImport`), `useMeetOps.ts`
  (`useProposeCalendarImport`, `useConfirmCalendarImport`),
  `MeetOpsPage.tsx` — a second button, "Import from Athletic.net," next
  to the existing "Import from races" one, opening `ImportCalendarDialog`
  (same review-then-confirm checkbox-list UX as the races importer, plus
  an "Already on schedule" badge and a "N scraped results will be linked"
  hint per row so a re-run is legible rather than mysterious).

Verification: `node --check` on every touched backend file; `npx prisma
generate` succeeds against the updated schema (confirms the migration
and Prisma schema agree — actually applying it needs the real DB, which
this sandbox can't reach, same as every prior migration this session);
backend suite 103/104 green (only the pre-existing Playwright-binary gap
fails, unrelated); `routeAuth.test.js` confirms both new routes carry
proper guards; `tsc -b --force` and `vite build` clean; headless-browser
check on `/t/:id/meets` shows no client-side crash. Not verified: the
actual end-to-end import against a real logged-in session (this sandbox
has no way to authenticate against the deployed app), or how the iCal
feed behaves for a team with zero scheduled meets yet, or an
Athletic.net-side rename of an already-imported meet's `SUMMARY` (the
upsert would silently rename our copy to match on next import — a
deliberate choice, not an oversight, but worth knowing about if a coach
ever asks "why did this meet's name change").

## Analytics by group: filter, compare, prior-season fallback

User request: a group-scoped view of analytics — filter to one group,
show only its athletes, compare groups against each other — plus a
specific requirement they flagged as the important part: an athlete with
no races yet this season should show their most recent prior season's
performance instead of nothing, since a group often gets set before the
first meet.

**Why this isn't built on the existing metrics pipeline.** The obvious
approach would reuse `services/performance/calculationService.js`'s
`AthleteSeasonMetrics` cache table — same numbers shown elsewhere. Ruled
out on purpose: that table only exists once a coach explicitly runs
"Calculate Metrics" for a season (`AnalyticsPage.tsx`'s `needsCalculation`
gate), which is the *exact same blocker* item #4 from the "five items"
round fixed for the athlete profile page ("I should be able to view the
profile... without having to have created 2026 analysis first"). Building
group analytics on top of that cache would reintroduce the same complaint
in a new place — a coach setting up groups in the preseason, before a
single result exists, is precisely when this view matters most. Instead
it's computed live from `Result`/`Race` rows directly, same as the
meet-entries screen's `seasonBestSec` helper already does — always
correct, never blocked on a separate step.

**Design decisions, worked out before writing code (this was flagged by
the user as possibly unspecified, so worth recording the reasoning):**
- *Pace, not raw time* — a group mixes athletes who race different
  distances at different meets, so raw seconds aren't comparable across
  athletes or across a season. Normalized to sec/mile via
  `Race.distanceMeters` (falling back to parsing `Race.distance` when
  unbackfilled), matching the normalization already used everywhere else
  pace is shown in this app.
- *Group roster = current active membership, not per-race historical
  membership.* Considered using `getGroupOn(athleteId, raceDate)` (already
  built for T2) to attribute each individual historical race to whichever
  group the athlete was in on that specific day — rejected as more
  surprising than useful: "filter by group, show only athletes within the
  group" reads as present-tense roster, and groups are already
  season-scoped rows that reset each season, so "who's actively in this
  group" (`GroupMembership.endDate: null`) is the same simple query the
  existing `GET /groups/:id/members` endpoint already uses. A mid-season
  group-switcher's full season shows up under their *current* group, not
  split across old and new.
- *Prior-season fallback is per-athlete, never blended into the group's
  own aggregate.* An athlete with zero current-season races falls back to
  their most recent prior season with data (walking seasons newest-first,
  not just "last year" — a gap year needs to keep looking). That fallback
  is always labeled (`isFallback: true`, badge in the UI showing which
  season the number is actually from) and always excluded from the
  group's own average/best pace — a fast returner's old data must never
  quietly make a group's "this season" number look better than the group
  has actually run yet. Considered whole-view fallback (if literally
  nobody in the group has raced yet, show last season for everyone,
  labeled once) instead of per-athlete — went with per-athlete since it
  degrades gracefully mid-season too (new group member joins in October,
  everyone else has current data, only the new member needs the fallback)
  rather than only working as an all-or-nothing preseason special case.

**What got built.**
- `lib/groupAnalytics.js` — pure, DB-free: `paceSecPerMile`,
  `summarizeRaces` (best/avg pace + race counts, races with no parseable
  distance counted but excluded from pace math, never treated as a zero),
  `buildAthleteSeasonSummary` (current season if it has data, else walks
  prior seasons newest-first, returns `null` only for a genuine
  never-raced athlete — not a zero-pace object), `summarizeGroup`
  (aggregates only non-fallback athletes). 11 tests
  (`test/groupAnalytics.test.js`), including the specific "a blazing prior
  -season pace must not pull the group's current aggregate down" case and
  the "no current-season data at all yields null, not zero/NaN" case.
- `routes/groups.js`: `GET /analytics?seasonId=&groupIds=id1,id2` —
  `groupIds` optional, defaults to the season's non-archived TRAINING
  groups (the "compare my squads" default); explicit ids can include
  Captain/Custom groups too, since a coach might reasonably want that,
  just not as the default (those are leadership designations, not
  performance cohorts). Batches one query for current-season results and
  one for every prior season across every requested group's athletes,
  groups them in memory — no N+1 per athlete.
- Frontend: `groupService.ts` (`GroupAnalytics`/`GroupAnalyticsAthlete`/
  `GroupAnalyticsSummary` types, `getGroupAnalytics`), `useGroups.ts`
  (`useGroupAnalytics`), new `components/analytics/GroupAnalyticsTab.tsx`
  — a checkbox row to pick which groups to compare (defaults to all
  training groups), a card per group with the this-season avg/best pace
  and a per-athlete table, fallback athletes shown with a "{year} data —
  no races yet this season" badge inline rather than hidden.
- `AnalyticsPage.tsx` restructured: the "By Group" tab is a 5th tab
  alongside Dashboard/Athletes/Meets/Performance, but deliberately placed
  *outside* the `needsCalculation` gate that blocks the other four — the
  whole point of this feature is working before that gate would ever
  clear. `formatPace`/`formatTime` reused from `lib/formatUtils.ts`
  (already imported on this page) rather than adding a fourth copy — see
  the still-open note elsewhere in this file about `lib/utils.ts`'s
  formatter duplicates; this was a chance to not make that worse.

Verification: `node --check` on every touched backend file; backend suite
114/115 green (only the pre-existing Playwright-binary gap fails,
unrelated); `tsc -b --force` and `vite build` clean; headless-browser
check on `/t/:id/analytics?tab=byGroup` (plus `/groups` and `/meets` as a
regression check on everything else touched this session) shows no
client-side crash. Not verified: real group/result data end-to-end (no
authenticated session reachable from this sandbox), or how the view reads
for a team with several seasons of gaps in between (e.g. raced 2023,
skipped 2024, group set up in 2025 — the "walk seasons newest-first"
logic should handle it per the pure-function tests, but only real data
would confirm it feels right to a coach looking at it).

## Closing the metrics-cache staleness gaps (audit → fix)

Follow-up to the group-analytics conversation above: the user asked
whether depending on `AthleteSeasonMetrics`/`TeamSeasonMetrics` at all was
the right call, worried live computation "across hundreds of teams at
once" would be slow. Answered that concern first — every query in this
app is already `teamId`-scoped, so "live" means per-request/per-team, not
a shared expensive computation; hundreds of teams means hundreds of cheap
independent queries, not one big one. Then audited every write path that
touches `Result`/`Race`/`Athlete` to find where the *existing* cache
(which is legitimate for the genuinely expensive whole-team aggregates)
goes stale.

**What the audit found.** `calculationService.calculateAllMetrics` is a
full recompute, not incremental — it re-derives the whole roster's
metrics and every race in the season from scratch on every call, no
diffing. The main Athletic.net season-results scrape (`routes/teams.js`
~353) already fire-and-forgets this after every bulk import — that path
was always correct. Nearly everything else wasn't:

- `DELETE /api/teams/:athleticTeamId/results` and `DELETE /api/seasons/
  :id/results` deleted the underlying `Result`/`Race` rows but left
  `AthleteSeasonMetrics`/`TeamSeasonMetrics` rows behind — worse than
  merely stale, since a coach clearing a season would still see its old
  totals displayed for data that no longer exists. (`MeetPerformanceMetrics`
  does cascade automatically via its `Race` FK — `onDelete: Cascade` — so
  only the other two tables had the gap.) A third endpoint,
  `POST /api/data/clear/:season` (`routes/dataManagement.js`), already
  did this correctly — explicit `deleteMany` on all three cache tables in
  the same request. That's the pattern every other clear/delete path
  needed to match.
- Roster-sync scrape (`POST /api/teams/scrape-roster`), adding an athlete
  to a season roster with a grade (`POST /api/teams/seasons/:year/
  roster`), and every single-athlete create/update/delete in
  `routes/athletes.js` write `gender`/`graduationYear` — both read
  directly by `calculationService`'s gender/grade breakdowns — with no
  recalculation trigger anywhere.
- `scripts/backfillDistanceMeters.js` writes `Race.distanceMeters`, which
  feeds pace math directly (`getAthleteRacesSeasonOnly`,
  `calculateMeetPerformance`) — running it silently invalidated every
  affected team's cached pace/mileage figures with nothing to refresh
  them, and it runs across every team in one pass (not scoped to one
  team's request), so this was the one write path in the audit that
  actually touches many teams at once.

**Fixes, all mirroring patterns already proven elsewhere in the codebase
rather than inventing anything new:**
- `routes/teams.js`'s `DELETE /:athleticTeamId/results` and
  `routes/seasons.js`'s `DELETE /:id/results` now `deleteMany` the cache
  tables for whichever team+season(s) were actually cleared, in the same
  request — same tables, same pattern `routes/dataManagement.js` already
  used correctly.
- `routes/teams.js`'s roster-sync scrape and roster-add-with-grade, and
  `routes/athletes.js`'s POST/PUT/DELETE, now fire-and-forget
  `calculationService.calculateAllMetrics(teamId, season)` after any
  write that actually changes gender or graduationYear — same
  fire-and-forget call the main scrape already uses, only triggered when
  something metrics-relevant changed (a bare name edit doesn't recompute
  anything). DELETE is the one that needed real care: an athlete's own
  `AthleteSeasonMetrics` rows cascade away automatically (FK to
  `Athlete`), but `TeamSeasonMetrics` has no FK to `Athlete` at all, so
  team-wide totals would keep counting a deleted athlete's results
  forever without an explicit trigger — the route now reads which
  seasons the athlete actually raced in *before* the delete cascades
  their `Result` rows away, and recalculates each of those seasons
  afterward.
- `scripts/backfillDistanceMeters.js` now tracks which (team, season)
  pairs it actually changed a `distanceMeters` value for (skipped
  entirely in `--dry-run`, since nothing was written) and awaits a
  recalculation for each at the end of the run, reporting failures per
  pair rather than letting one team's error abort the whole backfill.

**Deliberately left alone:** the two meet-import routes (`routes/
meetOps.js`'s race-based and calendar-based imports) and the CLI
`scripts/applyMeetMapping.js`/`applyCourseMapping.js` all write `Race.
meetId`/`courseId` with no recalc trigger — confirmed via the audit that
neither field is read anywhere in `calculationService.js`'s queries (it
groups by `teamId`/`season` only), so there's no actual staleness to fix
there; adding a trigger would just be wasted work with nothing to show
for it.

Verification: `node --check` on every touched file; backend suite
114/115 green (same pre-existing Playwright-binary gap, unrelated — no
regressions from these changes). No frontend changes — every fix here is
either a cache-cleanup addition or a new fire-and-forget call alongside
existing writes, none of it changes any response shape. Not verified:
the actual recalculation running end-to-end against a real database (no
DB access from this sandbox, same limitation as every schema/migration
change this session) — the logic was checked by reading the exact
pattern it mirrors (`routes/dataManagement.js`'s already-correct clear
endpoint) rather than by executing it.

## Found while writing testing steps: AnalyticsPage's "Clear team data" button 404'd

Working out how the user should test the delete-cache-purge fix above led
to checking which UI buttons actually reach
`routes/teams.js`'s `DELETE /:athleticTeamId/results` (the one I fixed).
`SettingsPage.tsx`'s "Clear Data" action calls it correctly
(`/teams/${team.athleticTeamId}/results`). `AnalyticsPage.tsx`'s "Clear
team data" button did not — it called `api.delete('/teams/data')`, a
bare, param-less path. No route matches it (the real route needs a
`/:athleticTeamId/results` two-segment path), so every click of that
button was a silent 404 with a generic "Failed to clear team data" toast
— unrelated to anything this session touched, a pre-existing bug, found
only because accurate testing instructions required tracing every UI
button back to a real endpoint.

Fixed to call the correct URL with the team's `athleticTeamId` (mirroring
`SettingsPage.tsx`), guarding for a missing team id the same way
`SettingsPage.tsx` does. Also corrected the confirm-dialog and success
copy while touching this code: it said "delete ALL athletes, races, and
results," but the endpoint's own comment is explicit that athletes and
roster membership survive — only races/results are removed. A coach
reading that confirm dialog before this fix was being warned about
deleting their whole roster when the action never did that.

`tsc -b --force` and `vite build` clean.

## Group Analytics tab: blank screen on a legacy season with no Season row

User testing on the real deployed app: the "By Group" tab appeared (after
a redeploy + hard refresh cleared up the earlier "tab missing" report,
which was just deploy lag) but showed a blank screen under it for the
team's 2025 season.

Root cause: `GET /teams/seasons` (`routes/teams.js:612`) deliberately
returns `id: null` for a season that has real race data but no `Season`
DB row yet — the comment there and the `Season.id: string | null` type in
`useAvailableSeasons.ts` both already document this as an expected state,
not a bug: it covers a team whose older seasons were imported before the
`Season` model existed for every year (`Season` rows only started getting
created reliably around item #10, "Populate Season + SeasonRoster on
import"). `GroupAnalyticsTab` assumed every viewable season had a real
`seasonId` and silently `return null`ed when it didn't — indistinguishable
from a broken page to a coach looking at it. Groups themselves are
modeled with a required `seasonId` FK, so there's genuinely no group data
possible for a season with no `Season` row — that part isn't fixable
without a broader backfill — but the empty state needed to say so
instead of rendering nothing. Now shows: "This season doesn't have
groups set up (it predates group tracking for this team)."

Did not build a Season-row backfill for old seasons — that's a separate,
bigger question (would it also try to reconstruct SeasonRoster/grades
retroactively? does the user even want Groups usable for old, already-
completed seasons?) worth asking about rather than assuming, not
something to guess at while fixing an empty-state message.

`tsc -b --force` and `vite build` clean.

## Group Analytics: decouple roster season from viewed data year

User feedback after the previous fix: "what doesn't happen now, is that
in analytics, I can't view 2024 data and click on groups and see what my
current group did. i only can see group data by choosing 2026 current
season." Confirmed this was a real gap, not a misunderstanding — the
endpoint was using the same `seasonId` for two different things at once:
which `Group` rows to use as the roster, AND which year of results to
treat as "current" for the per-athlete fallback. Picking 2024 in the
season selector meant "show me 2024's own Group rows" (which mostly
don't exist for a preseason-created 2026 group), not "show me 2026's
current groups' 2024 results," which is what the user actually wanted.

Fixed by splitting those into two independent inputs:
`routes/groups.js`'s `/analytics` route now takes `seasonId` (still: the
roster-defining season, always the team's actively-managed one) and a
new `dataYear` (which year of results to display for that fixed roster,
defaulting to the roster season's own year). They're genuinely
independent — `dataYear` reads straight off `Race.season` the same way
prior-season fallback already did, so a past year with no `Season` row
at all (like the legacy 2025 season from the last fix) works fine as a
`dataYear`, it just can't be a roster-defining `seasonId`.

The per-athlete "no race yet, fall back to their most recent prior
season" affordance now only fires when `dataYear` equals the roster
season's own year — that's specifically the live/preseason case it
exists for. Explicitly picking a past year is a coach asking "what did
this look like," and silently substituting a different year's number
there would be actively misleading, so no fallback happens in that mode:
an athlete with nothing in that specific year just shows blank, honestly.

Frontend: `AnalyticsPage.tsx` now resolves the team's active season's id
separately from whichever year is selected in the picker
(`activeSeasonMeta` vs. the existing `viewedSeasonMeta`/`viewedSeason`),
and passes them to `GroupAnalyticsTab` as two distinct props
(`groupSeasonId`, `dataYear`) instead of one conflated `seasonId`. The
existing top-level season selector now doubles as "which year to view
through your current groups" for this one tab, without changing what it
means for the other four tabs (their own team-wide snapshots are
unaffected). Added a "Showing {year} results for your current groups"
line so that dual meaning doesn't have to be inferred.

Verification: `node --check`, backend suite 114/115 green (same
pre-existing unrelated failure), `tsc -b --force` and `vite build`
clean. Not yet built: the "click a group, explore — charts, ranges,
performance over time as a group" follow-up request from the same
message, mirroring the Dashboard's existing Season Pace Trend/Pack
Running charts but scoped to one group. Investigating that next.

## Group Analytics: "explore" chart (pace trend + range, per group)

Follow-up: "we only need last best times and averages... click on a
group explore can then show charts and ranges. and performance over
time, but as a group. we have similar features, this one just focuses
on the current set of athletes." Confirmed the Dashboard's existing
Season Pace Trend chart (`components/analytics/DashboardTab.tsx`,
recharts `LineChart` fed by `useTeamSeasonSeries` /
`calculationService.getSeasonSeries`) was the feature being pointed at —
but that hook reads from `MeetPerformanceMetrics`, the same
calculation-cache table the rest of this session has been keeping
Group Analytics deliberately independent of. Building the group-scoped
version on top of it would have quietly reintroduced the "needs
calculation first" gate this whole feature exists to avoid, so it's a
new, live-computed sibling instead, not a reuse of that hook.

**Backend.** Added `summarizeGroupAtRace(paces)` to `lib/groupAnalytics.js`
— pure, given the group's pace values at one meet, returns
`{athleteCount, avgPaceSecPerMile, minPaceSecPerMile, maxPaceSecPerMile}`
(or `null` for no valid paces, never a zero). 4 new tests
(`test/groupAnalytics.test.js`), including "one finisher has min=avg=max"
and "invalid values are excluded, not treated as a fast time." New route
`GET /api/groups/:id/trend?dataYear=`: active roster for that group,
their `Result`s in `dataYear` (defaults to the group's own season year,
same independence from the roster season as the `/analytics` endpoint's
`dataYear`), grouped by race and summarized with the new pure function,
sorted by race date.

**Frontend.** `GroupAnalyticsTab.tsx` gained an "Explore" button per
group card, opening a dialog with a recharts `LineChart` — deliberately
built to visually match the Dashboard's Season Pace Trend chart (same
axis formatting via `formatPace`, same `CartesianGrid`/`Tooltip`/`Legend`
setup) so it reads as "the same kind of chart, just for one group,"
per the user's own framing. Group average pace is the solid line; min
("Fastest") and max ("Slowest") are dashed lines around it — a range
band without needing full per-runner finish-gap data the way the
Dashboard's separate Pack Running section computes (that's a genuinely
different, heavier calculation; a min/max spread satisfies "ranges"
without taking on that complexity for a first version).

Verification: `node --check`; backend suite 118/119 green (same
pre-existing unrelated failure); `tsc -b --force` and `vite build`
clean; headless-browser check on `/t/:id/analytics?tab=byGroup` with a
past-year query param shows no client-side crash. Not verified: the
actual chart rendering against real multi-meet data (no authenticated
session reachable from this sandbox, same limitation as every UI
change this session) — the dialog's empty/loading states were
exercised, but a coach's own team's shape (how many meets per season,
how tight/spread the pack actually is) will be the real test.

## Platform super admin + coach "preview as athlete"

Two requests handled together since they share the same underlying
mechanism: "temporarily act as a different identity, for viewing/testing,
without a real account switch." (1) A single super-admin account
(vallejo+xc@gmail.com) that can view/edit any team, keeping full delete
ability. (2) A head/paid coach previewing the app as one of their own
athletes, to catch gaps in the athlete-facing experience they've never
actually used.

**Why this is a bigger deal than it looks, and what was checked before
touching anything.** `middleware/auth.js` has a comment (predating this
change) citing a past real vulnerability: an earlier version of this app
let a client-supplied teamId influence authorization, and the whole
rewrite's authority model exists specifically to remove that footgun —
`req.user.teamId` is resolved server-side, from a DB lookup keyed by the
verified JWT subject, and every route scopes by it, never by anything a
client sends. Building admin impersonation is, on its face, reintroducing
a client-influenced team-scoping decision — the exact bug class this
codebase was rewritten to eliminate. The design below is deliberately
built so that's not actually true: a client-supplied value (which team to
view) is only ever *honored* after the server has independently verified,
via a DB-backed lookup on the authenticated identity — never a client
claim — that this specific account is on a hardcoded-at-deploy-time
allowlist. For every other account, the header is inert, identical to it
never being sent.

**Backend.**
- `lib/superAdmin.js` — `isSuperAdminEmail(email)`, checking against a
  `SUPER_ADMIN_EMAILS` env var (comma-separated, case-insensitive),
  parsed fresh on every call rather than cached at module load (so tests
  can set `process.env` per-case). An env var rather than a `User.isAdmin`
  DB column on purpose: "there will only be one for now," so this avoids
  a migration and keeps the whole allowlist auditable/changeable in one
  place (a Railway env var) without a code deploy. 6 tests
  (`test/superAdmin.test.js`) — case-insensitivity, comma-list support, a
  never-matches-by-accident case for an empty/unset allowlist, and
  non-string input denying rather than throwing.
- `middleware/auth.js`'s `authenticate` now, after resolving the real
  user row: sets `req.user.isSuperAdmin` (always, for every request,
  regardless of whether impersonation is active — the frontend needs
  this to know whether to show the team-switcher UI at all); if
  `isSuperAdmin` and an `X-Admin-Team-Id` header names a real team,
  overrides `req.user.teamId`/`req.user.team` for that request only
  (nothing persists server-side — the frontend re-sends the header on
  every request via an axios interceptor) and sets
  `req.user.isImpersonating`; separately, if an `X-Preview-Athlete-Id`
  header names an athlete on the (possibly now-impersonated)
  `req.user.teamId` and the caller actually has HEAD_COACH/COACH
  authority there, overrides `req.user.linkedAthlete` and sets
  `req.user.isPreviewingAthlete`. Order matters and is deliberate: admin
  impersonation resolves first, so a super admin impersonating a team can
  also preview as that team's athletes — the preview check's authority
  test runs against whichever team is currently in effect.
- Extracted `hasTeamRole(user, allowedRoles)` out of `requireRole` (same
  owner-fast-path-then-TeamMember-lookup logic it always had, no
  behavior change — `test/requireRole.test.js`'s full existing suite
  still passes unchanged) so the preview-athlete authority check in
  `authenticate` doesn't duplicate it.
- `requireRole` gets one new branch, checked first: a super admin with
  `isImpersonating` true passes any role check outright — "keeps all
  ability to delete," per the request. `isSuperAdmin` alone, with no
  team actively selected, bypasses nothing (new test covers this
  specifically — being the admin account isn't enough on its own, a real
  team selection has to be in effect for a given request).
- New `requireSuperAdmin` middleware (checks the flag `authenticate` set,
  nothing else) and new `routes/admin.js`: `GET /api/admin/teams`,
  admin-only, lists every team for the picker (id, name,
  athleticTeamId, athlete count, current season) — this route grants no
  access itself, it's purely "what can I pick from." Added to
  `test/routeAuth.test.js`'s `GUARD_NAMES` set.

**Frontend.**
- `lib/impersonation.ts` — sessionStorage (not localStorage: survives
  navigation/refresh within the active tab, cleared when the tab closes,
  never silently lingers across devices/sessions) holding the currently-
  selected admin team id/name and preview athlete id/name, plus
  set/clear functions that do a full page reload/navigation rather than
  trying to invalidate every react-query cache key by hand for a feature
  used rarely and always followed by a real navigation anyway.
- `api/axios.ts` gets a request interceptor attaching `X-Admin-Team-Id`/
  `X-Preview-Athlete-Id` from that storage to every request when active.
- `router/TeamRouteGuard.tsx` needed no changes — it already redirects
  based on `currentUser.team.athleticTeamId` vs. the URL, and since
  `currentUser.team` now naturally reflects whichever team is currently
  impersonated (the same `GET /users/me` call the interceptor also
  headers), the existing "stale URL" redirect logic handles both
  entering and exiting impersonation for free. `clearAdminTeam()`
  deliberately just reloads the current URL rather than navigating
  anywhere specific, for the same reason — once the header stops being
  sent, the guard corrects the URL back to the admin's own real team (or
  `/onboarding` if they have none) on its own.
- New `components/AdminTeamSwitcher.tsx` (search-filtered team picker
  dialog, only rendered in `Layout.tsx`'s sidebar when
  `currentUser.isSuperAdmin`) and `components/ImpersonationBanner.tsx`
  (always-visible, non-dismissible-without-exiting banner for both
  admin-team-view and athlete-preview modes — deliberately impossible to
  forget you're acting as someone else mid-session, especially before a
  destructive action). `Layout.tsx` restructured slightly so the banner
  spans the full width above the sidebar+content row, not just the
  content column.
- `RosterPage.tsx` gained a "Preview as athlete" button per roster row
  (same `isCoach` visibility gate the page's other coach-only actions
  already use), calling `setPreviewAthlete` and navigating to `/me`.

Verification: `node --check` on every backend file; backend suite 126/127
green (only the pre-existing unrelated Playwright-binary gap fails);
`tsc -b --force` and `vite build` clean; headless-browser check on
`/roster` and `/settings` (the two pages touched) shows no client-side
crash. Not verified: the actual admin flow end-to-end against real
teams/accounts (no authenticated session reachable from this sandbox,
same limitation as every UI change this session) — in particular,
`SUPER_ADMIN_EMAILS` needs to actually be set in the production Railway
environment for vallejo+xc@gmail.com to see any of this; it does nothing
until that env var exists there.

## Training paces (800m T-pace), surfaced automatically, ahead of race predictions

User: "the race predictions are not as useful as training paces. an
athlete and coach should know what their 800m t-pace should be based on
their most recent performance."

**What was already there, found by reading before building.**
`lib/vdotPaces.ts` already implements the real Daniels-Gilbert VDOT
formulas and already derives all 5 named training-pace zones (Easy/
Marathon/Threshold/Interval/Repetition) from a race performance —
correctly, verified against a published reference point (a 17:00 5K →
VDOT ~60 → Threshold ~5:53/mile, matching Daniels' tables). `athlete
Service.getRecentRaces` and `MyProgressPage.tsx`'s "Recommended training
paces" card already existed too: an athlete's own self-service view
already defaults to their most recent race and shows zone paces, no
manual entry required. What was actually missing was narrower than it
first sounded: (1) no per-distance split times (sec/mile is useful for a
long run, useless for "what should I hit at the 800m mark of an interval
workout"), and (2) none of this existed on the *coach-facing* athlete
profile — a coach had to go to a separate, manual, standalone "Tools"
calculator and pick both an athlete and a specific race by hand.

**What got built.**
- `lib/vdotPaces.ts`: `intervalSplitsForZone(zone)` — given a training
  pace zone, returns split times (seconds) at 400m/800m/1000m/1200m/mile.
  Deliberately returns `[]` for Easy/Marathon: those describe continuous
  running, not something anyone hits a stopwatch split for every 800m,
  so showing splits there would be a number nobody uses, not a feature.
  No frontend test runner exists in this repo (checked — no test script,
  no `.test.` files anywhere under `web/src`), so this was hand-verified
  against the same published VDOT reference point above (an 800m
  Threshold split of ~2:56 for a VDOT-60 runner) rather than left
  unverified.
- New shared `components/TrainingPacesCard.tsx` — extracted from
  `MyProgressPage.tsx`'s existing card (which now just renders it) so
  the exact same "most-recent-race, live-computed, per-distance splits"
  behavior is available in one place instead of two copies. No behavior
  change on the athlete self-service view beyond the new split-time line
  per workout zone.
- Added the same card to `TeamAthleteProfilePage.tsx` (the coach-facing
  profile) — new, wasn't there before. Fetches recent races
  independently via the same `getRecentRaces` endpoint, deliberately NOT
  gated behind the page's `enhancedAthlete`/metrics-calculation check —
  same reasoning as every other "don't require a calculation step first"
  fix this session (group analytics, the original athlete-profile fix
  from item #4 much earlier). A coach now sees training paces for any
  athlete immediately, calculated metrics or not.
- `components/tools/VDOTCalculator.tsx` (the standalone manual tool):
  added the same per-distance splits to its training-pace cards for
  consistency; reordered its "Predictions" tab so Training Paces render
  first and Predicted Race Times render second, sub-labeled "(for
  reference)" — de-emphasized per the user's framing ("not as useful
  as"), not removed, since Riegel-formula equivalent-time predictions
  are still a real, if secondary, use case. Renamed that tab from
  "Predictions" to "Training Paces" to match the new priority. Also
  fixed the "From Athlete" flow to default to the athlete's most recent
  race instead of leaving the race dropdown blank — matches "based on
  their most recent performance" instead of requiring a coach to
  remember to pick it.

Verification: `tsc -b --force` and `vite build` clean; backend suite
126/127 green (unrelated, unaffected — no backend changes this round);
headless-browser check on `/me`, `/tools`, and `/athlete/:id` (the three
pages touched) shows no client-side crash (one smoke-test URL typo of my
own — `/athletes/abc` instead of the real singular `/athlete/abc` route —
briefly looked like a router error before I corrected the test itself;
not a real bug, confirmed by re-running against the correct path). Not
verified: the actual numbers against a real coach's real athletes and
real race history — the VDOT math was checked against one published
reference point, not a full table.

## Custom domain (leadpack.cc): fixed the code-side blocker before DNS

User registered leadpack.cc on Porkbun and wants it pointed at
production. The DNS/registrar/Railway-dashboard steps are all outside
this repo — can't execute those from here, gave the user a step-by-step
guide instead. What *is* in this repo: `server.js`'s CORS middleware had
the production allowed origin hardcoded to a single string,
`https://xcapp-production.up.railway.app` — once traffic starts arriving
from `leadpack.cc`, cross-origin requests from the new domain would have
been silently rejected by the browser (no server-side error to even see,
CORS failures are enforced client-side).

Fixed to read a comma-separated `ALLOWED_ORIGINS` env var when set,
defaulting (when unset) to `leadpack.cc` + `www.leadpack.cc` + the
original Railway subdomain all at once — so the switch works with zero
required env var changes, and the old Railway URL keeps working during
the transition (bookmarks, anything still linking to it) rather than
breaking the moment the new domain goes live. A future domain change is
now a Railway env var edit, not a code deploy.

Verification: `node --check server.js`; backend suite 126/127 green
(unrelated, unaffected). Not verified: the actual domain working
end-to-end — that depends entirely on the DNS/Railway steps outside this
repo, which the user still needs to do.

## Sidebar nav items hidden behind the profile footer (layout bug, not a permissions bug)

User reported (on the new leadpack.cc domain) that Data Management,
Coaches Tools, and Feedback were missing from the sidebar even though
their account clearly had coach access (Practice Plans/Meets/Equipment,
which are gated by the exact same `isCoach` check, were showing fine).
That ruled out a stale-deploy or role/permissions explanation before any
code changed — a single `isCoach` boolean can't be true for some items in
the list and false for others in the same conditional block. `git log`
also confirmed Coaches Tools/Data Management/Feedback have been in that
same block since *before* Practice Plans/Meets/Equipment were added, so
a stale build would be missing the newer items too, not just the older
ones — the opposite of what was reported.

Root cause was a CSS layout bug: `web/src/components/Layout.tsx`'s
`<aside>` never actually had `display: flex`, so `flex-1` on the `<nav>`
did nothing — nav just grew to its full content height in normal block
flow, with `overflow-y-auto` doing nothing because nothing was bounding
its height. The profile/settings/logout footer was positioned
`absolute bottom-0` relative to the aside's full `h-screen` height,
which meant it visually sat on top of (and made unreachable) whatever
nav items happened to fall in that same vertical range — on a phone-size
viewport, that was Coaches Tools/Data Management/Feedback, hidden behind
an opaque footer instead of being one scroll away. The user's own
description once we asked the right diagnostic ("it's a UI issue, when
collapsed it was hidden beneath the profile") confirmed this directly.

Fixed by making `<aside>` a real flex column (`flex flex-col`), adding
`min-h-0` to `<nav>` (required for `flex-1` + `overflow-y-auto` to
actually bound and scroll a flex child — a well-known flexbox gotcha,
without it a flex item won't shrink below its content's natural size),
and changing the footer from `absolute bottom-0` to an in-flow
`flex-shrink-0` block at the end of the column. Same visual result when
everything fits, but now nav genuinely scrolls in the remaining space on
short viewports instead of overlapping the footer.

Separately, while investigating this I confirmed a second, real, and
still-open gap: there is no UI anywhere in the app for a head coach to
compose/send a staff invite. `POST /api/team/staff-invite` (backend) and
the accept-side `StaffInviteAcceptPage.tsx` both exist and work;
`UpgradeRolePage.tsx` even references a "Staff settings" screen that was
apparently never built. Addressing that next.

Verification: `tsc -b --force` and `vite build` both clean. Not yet
verified against an actual short/phone viewport in a real browser (no
UI test runner in this repo, per earlier session note) — reasoned from
the CSS/flexbox mechanics and the user's own description, not observed
directly in this sandbox.

## Built the missing "invite another coach" screen

The gap flagged in the sidebar-scroll investigation above: `POST
/api/team/staff-invite` (head-coach-only), `GET /api/team/staff` (list
current staff + pending invites), and `PATCH /api/team/staff/:userId`
(change role / revoke) were all already live on the backend — the only
piece that was actually missing was a screen to use them from.
`UpgradeRolePage.tsx` even promised one exists ("your head coach can send
you an invite... from their Staff settings"), and `web/src/api/teamService.ts`
already had a `getStaff()` method — but only `useGroups.ts`'s `useStaff()`
called it, for the group-leader picker dropdown, not for a management
screen. Nothing in the frontend ever called the invite or update
endpoints.

Added `teamService.sendStaffInvite(email, role)` and
`teamService.updateStaffMember(userId, {role?, active?})`, and a new
`web/src/components/settings/StaffManager.tsx` — invite-by-email-and-role
form, current staff list (role dropdown + revoke/restore toggle per
person), and pending invites list, mirroring the copy-the-link pattern
`RosterPage.tsx` already uses for athlete invites (no email service is
wired up, so the head coach sends the `/staff-invite/:token` link
themselves, same as athlete invites and join codes already work). Wired
into `SettingsPage.tsx` next to the existing `MeetGroupsManager`, behind
the same `team && currentUser?.role === 'coach'` gate the rest of that
page already uses.

One known imprecision, consistent with how the rest of this codebase
already handles it rather than a new problem: `currentUser.role` only
distinguishes coach/athlete, not which *kind* of coach — a
VOLUNTEER_COACH will see this card (frontend gate passes) but get a 403
from the backend on the invite-send and role-change actions, which
requireRole(['HEAD_COACH']) correctly rejects. The list itself
(`GET /staff`) does allow COACH in addition to HEAD_COACH. Errors from
attempting a head-coach-only action surface via the existing toast
pattern (`getErrorMessage` reads the backend's `msg` field) rather than
hiding the whole card, same as Data Management and Settings already do
elsewhere on this page for other permission-scoped actions.

Verification: `tsc -b --force` and `vite build` both clean; backend
suite still 126/127 (unchanged — no backend code touched, both invite
and staff-list endpoints already existed and were already covered by
`routeAuth.test.js`'s guard-detection sweep). Not verified: an actual
invite round-trip against a live team (no way to run the full app in
this sandbox) — reasoned from the existing, working athlete-invite flow
this mirrors and from reading the already-live backend route handlers
directly.

## Field results: cross-team sharing of the same meet's aggregate stats

User's question after the manual field-results upload landed: "if we
upload an entire set of results, shouldn't those be usable by potential
other teams that use LeadPack (xcapp)?" — yes, and the "Duplicate
strategy" note above (Meet/`athleticMeetId`, T4 calendar import) already
anticipated exactly this: `Meet` and `Race` stay `teamId`-scoped on
purpose (deliberate multi-tenancy — 20 teams at one invitational really do
need separate plans/entries/rosters), but `Race.athleticMeetId` was
captured specifically so "a future cross-team feature has the join key
already sitting there if it's ever built." This is that feature, scoped
narrowly: only the three AGGREGATE numbers get shared
(`fieldMeanSec`/`fieldMedianSec`/`fieldFinisherCount`), never a
`FieldResult` row and never a source team's identity — the no-named-rows
privacy invariant on `FieldResult` is about API responses, and this
never puts one in an API response.

Deliberately a one-time copy, not a live sync, and no schema change: adding
provenance tracking (which race's numbers came from which upload, so a
later `DELETE` on the source cascades to every team that copied from it)
would be the "real schema change... shared canonical meet entity" the
T4 note explicitly deferred as out of scope with no feature needing it yet.
This feature doesn't need it either — copy-once is enough to kill the
"20 coaches paste the identical CSV" problem, and a team that copies stale
numbers can always re-copy or do their own real upload later.

`routes/fieldResults.js`: `findSharedFieldSource(race)` — given a race with
a non-null `athleticMeetId`, finds another team's `Race` row with the same
`athleticMeetId` and `name` (Athletic.net already splits boys/girls/JV
into separate races, so `name` disambiguates within one meet without a new
field) and a non-null `fieldFinisherCount`. `GET /races` now runs this for
every race that has no field data of its own yet and returns
`availableFromOtherTeam`/`otherTeamFieldFinisherCount` alongside the
existing aggregate fields. New `POST /:raceId/copy-from-meet` re-derives
the source itself server-side (never trusts a client-supplied race id, so
it can't be used to probe another team's race ids) and copies the three
fields onto this team's race — same `requireRole(['HEAD_COACH','COACH'])`
tier as upload. `FieldResultsPage.tsx` shows a "Available from another
team (N)" badge and a "Use shared results" button in place of Upload for
races that qualify; uploading for real, or clearing, both still work
exactly as before and simply stop the race from being a candidate for
future sharing lookups (it now has its own data, real or cleared-to-null).

Verification: `node --test` 152/153 (the one failure,
`scraper.test.js`, is the pre-existing missing-Playwright-browser gap in
this sandbox, unrelated); `tsc -b --force` and `eslint` clean on the
changed frontend files. Not verified against a live DB (still no
`DATABASE_URL` in this sandbox) — two teams' races sharing an
`athleticMeetId` was reasoned from the T4 import code path, not observed
against real rows.

## Meet scraper (Phase 2 step 3): real selectors found, still not built

User supplied a working third-party Chrome extension
(`athletic.net-data-extractor`, MIT, `contentScript.js`/`popup.js`) that
extracts XC/Track results by running as a content script in the coach's
*own* logged-in browser tab — same "the human's browser isn't
Cloudflare-blocked, only this sandbox's automation is" workaround as the
manual-upload fallback, just scripted instead of copy/paste. Its selectors
are real and presumably tested against the live site (not something this
session fabricated, so they don't run afoul of rule 1/3's "no selectors
from assumption" — they're evidence, the same as a saved fixture page
would be, just not one this session captured itself):
`shared-result-grid` → `.result-row` rows, `.place-column` (place),
`.primary .title a[href*="/athlete/"]` (name), `.subtitle.team
.text-overflow-ellipsis a` (school), `.secondary .title a` (time),
`shared-tertiary-stats` text parsed with `/Yr: (\d+)/` (grade) and
`/\+(\d+)pts/` (XC) or `/([-+]?\d+\.?\d*)m\/s/` (track wind). Sections are
found by walking `h5` headers for a `.mb-4` ancestor's `shared-result-grid`
(handles a results page with multiple heats/sections; falls back to a
flat `.result-row` sweep if no `h5` sections are found).

This still doesn't unblock `scrape_meet_playwright.js` itself — that needs
a *server-side* browser to reach the page at all, and this sandbox's
Chromium still can't get past the network layer (`net::ERR_CONNECTION_RESET`,
re-verified earlier this session, unchanged). What it does unblock: a
same-idea, in-app bookmarklet (see next entry) that runs client-side in the
coach's own browser like the extension does, using these confirmed
selectors, feeding the *existing* Field Results upload flow directly
instead of requiring a coach to hand-build a CSV from what they see on
the page. The scraper itself is still genuinely stuck on network access
or a saved fixture page, exactly as documented above — not attempting it
without one of those two things.

## Schedule/Meets nav consolidation + a concurrency-safety pass + attendance tracker

Three separate user requests, done in sequence on `neon-migration`, pushed as
of commit `24803ff`.

**Nav**: Schedule stays the calendar; Workouts (Templates/Interval Sessions),
Practices, and Meets all live under it now instead of Meets having its own
sidebar item. `Layout.tsx`'s coach sidebar dropped the standalone "Meets"
`NavItem` (athletes keep theirs — they have no Schedule view); `SchedulePage.tsx`
gained a "Meets" button in `scheduleActionButtons`, first among the existing
Workout Templates / Interval Sessions / Export / Import buttons.

**Concurrency audit**: went looking for the same "reconstructed stale
snapshot silently overwrites a concurrent edit" bug the splits fix caught
earlier, across the other multi-coach screens. Found and fixed it in three
more places, each via whichever retrofit was less invasive to the existing
component:
- **Meet results entry** (`EnterRaceResultsDialog`, `MeetDetailPage.tsx`): was
  resending every roster row's time+status on every save. Now tracks
  per-row-per-field `touched` state and only includes touched fields for
  touched athletes; `decideResultWrite()` (new, `backend/lib/raceResults.js`,
  unit-tested) decides skip/upsert/delete per entry based on which keys are
  *present* in the body, never on falsy-ness — `POST /races/:raceId/results`
  in `meetOps.js` now calls it per entry instead of a hardcoded
  keep-if-time-present rule.
- **Practice plans** (`DayEditorDialog`, `SchedulePage.tsx`): was resending
  all 8 fields on every save. Retrofitted with an `initialFormRef` (captured
  at mount, diffed at save) rather than rewiring every onChange — lower
  blast radius than the touched-tracking approach for a single-form dialog.
  `POST /practice-plans` now only writes fields present in the body.
- **Captain notes** (`RosterPage.tsx`): `setCaptain()` was resending
  `isCaptain` alongside notes on every notes-only save, risking clobbering a
  concurrent captain-toggle. `isCaptain` param made optional; omitted
  entirely from the notes-save call.

**Print-ready interval sheets**: `IntervalSessionManagePage.tsx` got a Print
button (`window.print()`) and a `hidden print:block` plain-table section —
same Tailwind `print:` variant approach as the existing splits-entry print
view (no global print CSS in this codebase). Cells show the actual value if
entered, a blank ruled box otherwise, so it works as both a pre-session
blank backup sheet and a post-session printed record.

**Attendance tracker** (new feature, full stack): a digitized version of the
physical clipboard. `AttendanceSession` (date/time/location/team/season) has
many `AttendanceRecord` (one per athlete, `PRESENT|ABSENT|EXCUSED|LATE`,
defaults `PRESENT` on creation — "pre-printed roster, mark exceptions", not a
blank sheet). Records are seeded once from the active roster at session
creation and never re-synced; a walk-on gets added via a separate ad-hoc
endpoint, same idea as `IntervalSessionEntry.addedManually` (though
`AttendanceRecord` doesn't carry that exact boolean — minor divergence, not
load-bearing anywhere yet). `backend/routes/attendance.js`: list/create/get/
patch/delete sessions, plus add/patch/delete per-record — the per-record PATCH
is single-row by construction so there's nothing that could ever clobber a
sibling athlete's row, the same lesson as the meet-results fix above, just
designed in from the start instead of retrofitted. Merge tool
(`athletes.js POST /merge`) got a dedupe/repoint block for
`AttendanceRecord`, same `planDedup()` primitive as every other merged table
— required, since every FK to `Athlete` cascades on delete.

Frontend: `AttendancePage.tsx` (session list, mirrors `IntervalSessionsPage`)
and `AttendanceSessionPage.tsx` (take-attendance detail, mirrors
`IntervalSessionManagePage`) — both standalone full-screen routes outside
`Layout`, reached via a new "Attendance" button on Schedule. Roster grouped
by grade descending then alphabetical by last name within grade (matches
`RosterPage`'s `byGrade` sort; new `lastNameOf()` util in `formatUtils.ts` —
there's still no dedicated lastName column anywhere in the schema, this just
splits on the last whitespace token same as the one precedent in
`TeamAthleteProfilePage.tsx`). Status toggles autosave immediately per
athlete (no batched save button for the grid itself). CSV export
(locally-duplicated `downloadCsv`/`toCsv`, same convention as
`SchedulePage`/`SplitsEntryPage` — not extracted to a shared lib, matching
this codebase's existing per-page-duplication convention). Also got a print
view, unprompted but consistent with the "this is how we do it on a physical
sheet" framing and the interval-sheets print feature added immediately
before it in the same session — worth confirming with the user it's wanted,
not just assumed permanently correct.

Verification: `node --test` 340/341 (`extractResults against fixture HTML`
is the same pre-existing unrelated failure noted throughout this file);
`tsc -b`, `eslint` on touched files, and `npm run build` (web) all clean.
Not verified against a live DB or in an actual browser — same sandbox
limitation as everything else in this file.

## Attendance rework: weekly grid, grade tabs, blank-by-default, and a real duplicate-session fix

User feedback on the tracker above, three requests plus a bug report:

1. **"Gigi Anderson showing up twice."** Couldn't inspect this team's actual
   data (no live DB access in this sandbox), but found a real, code-level
   cause that fits the symptom exactly: `AttendanceSession` had no
   uniqueness constraint on `(teamId, seasonId, date)`. Two coaches each
   using the old "New session" dialog for the same date — or, after this
   session's own week-view addition, two coaches opening the same
   brand-new week at the same moment — could each seed a full duplicate
   roster for that date, so every athlete (not just Gigi) would appear
   twice the moment both sessions were visible together. Fixed with a real
   `@@unique([teamId, seasonId, date])` constraint (migration
   `20260826010000_attendance_week_view`), which first merges any existing
   duplicate sessions for the same date (moving each duplicate's records
   onto the earliest session, skipping an athlete already present there
   rather than dropping their row) before the constraint goes on.
   `POST /api/attendance` and the new find-or-create helper below both
   handle losing a create race to a concurrent request on the same date by
   re-reading the winner's row instead of erroring, so this can't
   reappear. **If Gigi is still doubled after this migration runs**, that
   means it's actually two separate `Athlete` rows (e.g. a CSV
   double-import), not a duplicate session — worth checking the roster for
   two "Gigi Anderson" entries and using the existing athlete merge tool
   (Data Management) if so; not something this session could confirm
   without live data.

2. **Weekly view.** The single-day-session model (still there underneath)
   is no longer the primary UI. New `GET /api/attendance/week?seasonId=&weekStart=`
   finds-or-creates the five weekday sessions starting at `weekStart` in
   one call (reusing the same roster-seeding logic as `POST /`, via new
   `resolveRosterAthleteIds`/`findOrCreateSessionForDate` helpers) and
   returns them together. `AttendancePage.tsx` is now a Monday-Friday grid
   — one row per athlete, one column per day, prev/next week navigation,
   CSV export and print both scoped to the visible week. Per-day specifics
   that don't fit a dense grid (location, time, notes, adding a walk-on,
   a single day's print/export) stay on `AttendanceSessionPage.tsx`,
   reached via a small settings icon under each day's column header; a
   `?week=` query param round-trips between the two so closing the detail
   page returns to the same week instead of snapping to the current one.

3. **Grade tabs.** `AttendancePage` derives the distinct grades present in
   the current week's roster and renders them as tabs (plus "All"),
   filtering the grid's rows client-side — lets several coaches split one
   week by grade and each work their own tab. Purely a display filter, no
   new backend scoping: every coach-tier role already sees the whole
   team's roster, same as before.

4. **Don't auto-select Present.** `AttendanceRecord.status` now defaults to
   `ABSENT` instead of `PRESENT` (same migration as the uniqueness fix) —
   this feature's first pass modeled the physical sheet as "pre-printed
   roster, mark exceptions"; real use showed the opposite is wanted for a
   weekly grid: blank by default, check off who showed. Blank now means
   "unmarked / didn't show" everywhere in the UI, not a distinct fourth
   status a coach has to consciously click — new
   `AttendanceStatusCell` (`web/src/components/attendance/StatusCell.tsx`)
   is a single click-to-cycle control (blank → ✓ Present → E → L → blank)
   used by both the week grid's cells and the day-detail page's rows,
   replacing the day-detail page's old four-separate-buttons row (which
   would otherwise have shown "A" pre-highlighted by default, contradicting
   the point of this change). Cycle order and labels live in one place,
   `web/src/lib/attendanceStatus.ts`, so the grid, the day-detail page, and
   CSV/print labeling can't drift from each other.

Verification: `node --test` 340/341 (same pre-existing unrelated scraper
fixture failure noted throughout this file — backend `node_modules` and
Prisma client weren't installed at the start of this session either;
installed fresh, then ran with dummy `DATABASE_URL`/`DIRECT_URL` +
`NEON_AUTH_JWKS_URL` as usual); `tsc -b`, `eslint` on every touched
frontend file, and `npm run build` (web) all clean; `npx prisma validate`
clean against the updated schema. Not verified: the migration's dedupe
logic against actual duplicate rows (no live DB access, and this session
couldn't confirm duplicate sessions are even what caused the reported
Gigi Anderson symptom rather than a duplicate Athlete row — see point 1),
and the grid/tabs in an actual browser (no UI test runner in this repo,
per earlier session notes).

## Groups page: a "My Groups" section, and click-to-open on Captain/Custom cards

Two follow-up complaints, both on `GroupsPage.tsx`:

1. "For coaches, my groups should be the first section they see." Asked
   which of three readings was meant (a new section of groups the coach
   personally leads; reordering the existing Captain/Custom section above
   the Training board; or just moving the whole board above the Cross
   Training banner) — user picked the first. New `myLedGroups` in
   `CoachGroupsView`: every group (any type — training, captain, or
   custom) where `group.leaders` contains the signed-in user's id,
   filtered client-side from the `groups` list `useGroups(seasonId)`
   already fetches (no new backend endpoint needed — leaders were already
   in the response). Rendered as a "My Groups" section right after the
   page header, before the "Cross Training today" banner — the literal
   first thing on the page below the title. A head coach not personally
   assigned as a leader of anything sees no such section (no manufactured
   empty state, matching this file's usual convention) — the page looks
   exactly as it did before for them.

2. "Clicking any group should pull up list of names... right now I can't
   just click to open." Real gap, confirmed by reading the code: the
   Training board's cards (`GenderColumn`) already toggle an inline
   member list on click, but the Captain & Custom Groups cards below it
   only had that behavior behind a separate "Manage members" button — the
   card itself (name, badge, member count) did nothing when clicked. New
   shared `GroupCard` component (used by both the new "My Groups" section
   and the existing Captain/Custom section) makes the whole card clickable
   to open `ManageMembersDialog` — the same dialog "Manage members" used
   to open, which already showed the roster and let a coach add or move
   members, so this is the "list of names, edit allows to add or move"
   the user described. The three icon buttons (rename, leaders, delete)
   stay as separate small targets that `stopPropagation` so they don't
   also trigger the card's open action.

   Since "My Groups" can include a TRAINING-type group (unlike the old
   Captain/Custom-only entry point), `ManageMembersDialog`'s "move to"
   list was widened from `otherGroups` (CAPTAIN/CUSTOM peers only) to
   `allGroups` minus the group being viewed and any archived ones —
   backend support for this was already generic (`POST`/`DELETE
   /groups/:id/members` and `GET /groups/:id/members` never restricted by
   type, gated by `canManageGroup` either way), so this is a frontend-only
   widening, not a new capability. TRAINING membership exclusivity is
   still enforced server-side by `moveAthleteToGroup` ("active is scoped
   per GroupType" — see the board's own comment above), so moving someone
   into a second TRAINING group here still correctly closes out their
   first one rather than creating an overlap.

Verification: `tsc -b`, `eslint src/pages/GroupsPage.tsx`, and `npm run
build` (web) all clean; backend `node --test` 340/341, same unrelated
pre-existing scraper fixture failure, unaffected since this is a
frontend-only change (no backend routes or schema touched). Not verified:
in an actual browser with a coach account that leads a group (no UI test
runner or live data in this sandbox) — reasoned from `useGroups`'s
existing response shape and the generic member-management routes, not
observed directly.

## Mobile UX pass on the field screens — and the first real browser verification in this repo

User: "focus primarily on the UX for mobile, especially on screens where
interaction is critical. Use the timer you built as an example of easy to
read and use. Padding can tighten a little. Color can be used, but really
focus on a strong UX."

Scope taken as the **field screens** — the standalone full-screen routes a
coach actually works from on a phone at practice or a meet: Attendance
(week + day), Splits entry, Interval sessions. `RaceLiveTimerPage` was read
first and treated as the reference: `max-w-lg` single column, `h-14`
controls, one big `tabular-nums` readout, uppercase micro-labels, color
used only where it means something.

**Two shared primitives** (`web/src/components/field/`), each codifying a
pattern one page had already discovered ad hoc and the others hadn't:
- `FieldHeader` — the sticky top bar, actions collapsing to icon-only below
  `sm`. IntervalSessionManagePage had invented this; SplitsEntryPage had
  *five* full-text buttons (`Import CSV`/`Export CSV`/`Print`/`Save`/
  `Close`) with `px-6` and no responsive handling at all, which on a phone
  is simply broken. Now all four field screens share one bar.
- `SegmentedPills` — the "which column am I on" selector. Also generalized
  from IntervalSessionManagePage's active-rep row.

**AttendancePage** is the substantial change: below `md` it no longer
renders the week grid at all. Five weekday columns plus a name column
cannot fit 375px without tiny text or sideways scrolling, and a coach
marking attendance on a phone is looking at one day anyway — so mobile gets
ONE DAY AT A TIME (weekday pills carrying a per-day "N marked" badge, then a
single-column athlete list). Desktop keeps the real grid. Both are rendered
and chosen by CSS breakpoint, matching `ResponsiveTabsList`'s existing
convention — no JS media query, so no flash of the wrong layout.

**Two controls for one status**, since the two surfaces have very different
room: `AttendanceStatusCell` (tap-to-cycle circle) stays for the desktop
grid; new `AttendanceStatusPicker` (explicit Present/Excused/Late buttons,
tapping the active one clears to blank) for the mobile day list and the
day-detail page — one tap for any status instead of up to three, which
matters when the coach is standing on a field correcting a mis-tap.

**SplitsEntryPage** got the same active-column treatment (one marker at a
time below `md`, pills synced to the existing column-major keyboard
navigation, reference columns — derived segments/pace/pattern — hidden on
mobile with the active marker's own segment surfaced under its input).

### Verified in a real browser — a first for this repo

Every prior entry in this file ends "not verified in an actual browser (no
UI test runner)". That was worth fixing at least once. Chromium and
Playwright are both present in this sandbox (`/opt/pw-browsers`, and
`playwright` under `backend/node_modules`), so: a **temporary** dev-only
harness (`web/harness.html` + `web/src/devHarness.tsx`, a second Vite entry
rendering the new primitives against mock data, needing no backend) was
served with `vite`, screenshotted at 375px and 1280px, and every
interactive element measured via `getBoundingClientRect`. **Both files were
deleted afterward** — nothing references them and they are not in the
commit; re-create them the same way if this is ever worth repeating.

It caught four things that reading the CSS did not, all now fixed:
1. **An unselected "✓" read as already-marked.** At full
   `muted-foreground`, the inactive Present button looked like an athlete
   who'd been checked in — the single worst thing this control could get
   wrong. Inactive options are now `text-muted-foreground/45` on
   `bg-muted/30` (`ATTENDANCE_STATUS_INACTIVE_CLASS`).
2. **Excused (amber-500) and Late (orange-500) were nearly the same hue**
   side by side on a phone — exactly the distinction a coach scans a column
   for. Late is now `blue-600`.
3. **The fifth pill was clipped** with no affordance — the day row's Friday
   sat off the edge behind a hidden scrollbar, so a coach would simply
   never find it. `SegmentedPills` now wraps instead of scrolling, plus an
   `equal` option (mobile-only, `sm:flex-none` — stretched across a laptop
   it made a "Sr 2" pill 350px wide) so all five weekdays fit one even
   strip at 375px.
4. **Touch targets measured 40px, not the intended 44.** `h-10` reads like
   "big enough" and isn't; every field-screen control is now `h-11`/44px on
   mobile, dropping back to `h-8`/`h-9` from `sm` up. The interval page's
   rep pills had been 28px and its remove button 28px.

Also confirmed: `document.scrollWidth === 375` at 375px and `=== 1280` at
1280px, i.e. no horizontal overflow at either, and no console/page errors.

Padding tightened throughout per the request: `p-6`/`p-3 md:p-6` bodies →
`p-3 sm:p-4`, `CardContent pt-6` → `p-3 sm:p-4`, roster lists to `p-0` with
full-bleed rows and tinted grade bands.

Verification: `tsc -b`, `eslint` on every touched file, and `npm run build`
(web) all clean; backend `node --test` 340/341 — the same pre-existing
unrelated scraper-fixture failure, and untouched here since this is a
frontend-only change (no routes or schema). Not verified: the real pages
against live data — the harness renders the primitives, not
AttendancePage's own data flow, so the day-focus view has been checked as
layout/markup but never against an actual week of records.

**Deliberately not done** (flagging rather than guessing, per rule 6): a
"mark everyone else present" bulk action to close out a day. It's the
obvious companion to blank-by-default and a coach will want it, but done
honestly it needs a bulk endpoint — the current per-record PATCH would fire
one request per athlete (~130 on a real roster). Backend scope, and beyond
"mobile UX", so it's a decision for the user rather than something to
smuggle into a layout pass.

## Athletes list: "Preview as athlete" reduced to an icon, not removed

User: "In the Athletes list, we can remove the preview athlete button for
all, or just make it the eyeball icon. I don't think it is really necessary
anymore." — two options offered, leaning toward removal.

Took the icon-only option, because removal turns out to cost more than the
phrasing suggests: `RosterPage.tsx` is the **only** entry point to the
preview feature anywhere in the app (`grep setPreviewAthlete` returns
`lib/impersonation.ts`'s definition and this one call site). Deleting the
button would leave a complete, working, still-maintained full-stack path
unreachable — `lib/impersonation.ts`'s preview half, the
`currentUser.isPreviewingAthlete` branch of `ImpersonationBanner`, axios's
`X-Preview-Athlete-Id` request header, `isPreviewingAthlete` on the `User`
type, and the server-side handling in `middleware/auth.js` — i.e. dead code
that still looks live to the next reader. The icon achieves what the
request is actually after (this row carries up to *eight* actions and
"Preview as athlete" was the longest label on it, for the action a coach
reaches for least) at no such cost.

Sized `h-11 w-11 p-0 sm:h-8 sm:w-8`, matching the touch-target convention
from the mobile pass above, with the explanatory copy moved into `title`
and a per-athlete `aria-label` so the icon isn't unlabeled for screen
readers.

If the feature really is dead to the user, the honest version of "remove
it" is a separate pass that also deletes the preview half of
`impersonation.ts`, the banner branch, the axios header, the type field and
the server middleware — worth doing deliberately, not as a side effect of
tidying one row. Flagged for them rather than assumed either way.

Verification: `tsc -b`, `eslint src/pages/RosterPage.tsx`, and `npm run
build` (web) all clean. Frontend-only, no backend touched. Not verified in
a browser — the button is inside `<Layout>` and needs live roster data, so
the harness approach used above didn't apply here.

## Group Analytics: a group picker that scales, and a diagnostic for missing athlete data

Two unrelated requests on the same screen.

### 1. The group selector

User: "we should change the ui so the group list is better organized, maybe
checkboxes, maybe multi select. once we add the 5 coaches groups it will get
too large."

Worth recording that it was **already** multi-select checkboxes — the old
flat wrap of `<Checkbox>` pills reads like a row of radio buttons at a
glance (shadcn's checkbox is a small rounded square, and only one was
ticked in the screenshot), which is presumably why it didn't look like one.
So the fix needed was organization and scale, not the selection model.

New `web/src/components/analytics/GroupPicker.tsx`:
- **Sections.** Training vs Captain/Custom. `GroupAnalyticsTab` already
  computed `trainingGroups` and `otherGroups` separately and then rendered
  them into one undifferentiated row; the backend draws the same line
  (`GET /groups/analytics` defaults to `type: 'TRAINING'` when nothing is
  explicitly selected, because captain/custom groups are leadership
  designations rather than performance cohorts).
- **Per-section All/None toggle.** "Just my training squads" and "just the
  coaches' groups" are the two selections a coach actually makes, and both
  were N individual clicks before.
- **Search**, and **collapse to a one-line summary** ("Groups · 2 of 19
  selected"), both appearing past `CROWDED_AT = 8`. Collapsed default is
  derived (`openState ?? total <= CROWDED_AT`) rather than a `useState`
  initializer, which would otherwise freeze the default at whatever the
  count was on first render — zero, before the groups query resolves.

Verified in a browser with a 19-group mock (2 training + 17 custom, i.e.
past the "5 coaches' groups" the user is anticipating), same temporary
harness technique as the mobile pass — **deleted again afterward**.
Screenshots at 375px and 1280px caught two things: the section All/None
buttons were `justify-between`'d to the far edge of a 1280px container, a
full screen-width from the heading they act on (now sit beside it), and the
expanded list on a phone was a ~2000px column that buried the analytics
(now `max-h-[50vh]` scrolled, with the search box left outside the scroll
area). No horizontal overflow at either width, no console errors.

### 2. "Callum Woods-Vallejo has 2025 data that should be shown"

Investigated; **could not be reproduced or fixed from here** — it needs the
live DB, which this sandbox has no access to. What the investigation did
establish:

- **It is not caching.** The user's guess ("caching, something") is ruled
  out by construction: `GET /api/groups/analytics` computes live from
  Result/Race rows with no metrics-cache table behind it (that's the whole
  point of the module — see `lib/groupAnalytics.js`'s header), and
  `useGroupAnalytics` sets no `staleTime`, so react-query's default of 0
  refetches on mount. There is nothing in this path that can serve stale
  data.
- **`Race.season` NULL is impossible** — it's `Int`, not nullable, so the
  "race filed under no season" theory is out.
- The remaining candidates, in rough order of likelihood on this team's
  history: a **duplicate Athlete row** (the group membership hanging off
  one row and the results off the other — exactly the shape of the Gigi
  Anderson duplicate discussed earlier this file, and this roster has been
  CSV-imported); **an unparseable/missing race distance**; a **non-FINISHED
  `status`**; a **closed membership** (`end_date` set); or a
  **season/date mismatch** on the race row.

One genuine code-level defect found while reading, worth knowing whichever
cause it turns out to be: `summarizeRaces()` returns `null` when a season's
races exist but none is pace-computable (no distance), so
`buildAthleteSeasonSummary` falls straight through and the athlete renders
**identically to someone who has never raced** — no badge, `raceCount: 0`,
em-dashes. That failure mode is invisible in the UI by construction.
Deliberately NOT changed here: the behavior is covered by an existing test
(`summarizeRaces: empty or all-unparseable input returns null, not zeros`),
changing it alters `summarizeGroup`'s aggregate arithmetic (a null
`avgPaceSecPerMile` summed into the group average is a NaN waiting to
happen), and this file's own rule 5 says write the test before the fix for
anything arithmetic. Fixing it on a guess about an athlete whose data I
can't see would be exactly the rushed arithmetic change that rule exists to
prevent. If the diagnostic below says NO-DISTANCE, that's the fix to make,
with tests.

Added `backend/scripts/diagnoseMissingGroupAnalytics.sql` — run in the Neon
console like `backfillDistanceMeters.sql`. Five sections, each ruling out
one cause, with a flags column (`NOT-FINISHED` / `NO-TIME` / `NO-DISTANCE` /
`SEASON-MISMATCH`) and a final section that reproduces the analytics
query's own filters verbatim for one athlete: rows in section 2 but nothing
in section 5 means the filters are what's dropping them, and the flags say
which. Section 4 answers whether it's athlete-specific or team-wide (if
`no_distance_at_all` is large, the fix is `backfillDistanceMeters.sql`, not
anything to do with Callum).

Verification: `tsc -b`, `eslint` on both changed frontend files, and
`npm run build` (web) all clean; backend `node --test` 340/341 — the usual
unrelated scraper-fixture failure. The SQL script is **not** executed
anywhere and has no test; it's a read-only diagnostic (five SELECTs, no
writes) meant to be pasted into a console by a human.

## Duplicate athletes confirmed; unreachable dialogs fixed; back buttons and a section colour scheme

User confirmed the diagnostic's top hypothesis: **Callum Woods-Vallejo and
Gigi Anderson both had duplicate Athlete rows, and the merge tool resolved
both.** That closes the "missing 2025 data" thread — it was never a caching
or query-filter problem, and `summarizeRaces`'s raced-but-no-pace blind
spot (flagged in the previous entry) was NOT the cause. That defect is
still real and still unfixed; leaving it flagged rather than acting on it
now that the actual cause is known to be something else.

### The unreachable dialog — a `dialog.tsx` bug, not a Groups bug

Reported as "on mobile, the groups of athletes view, when I open a group
where the list of names is more than what the screen can show, I can't
scroll or view anything." Root cause was in the shared primitive, so it
affected **every dialog in the app**, not just group members:
`DialogContent` is `fixed top-[50%] translate-y-[-50%]` with no
`max-height` and no `overflow`. Once its content exceeds the viewport it
extends off both the top and the bottom with no scroll container of its
own, while Radix scroll-locks the page behind it — the content is
genuinely unreachable, exactly as described.

Two layers of fix:
- `dialog.tsx`: `max-h-[calc(100dvh-2rem)] overflow-y-auto` on
  `DialogContent`. `dvh` rather than `vh` so mobile browser chrome is
  accounted for. This is the safety net — no dialog anywhere can be
  unreachable again.
- The three long-list dialogs in `GroupsPage.tsx` (members, leaders,
  cross-training roster) additionally scroll their *list* internally
  (`max-h-[50vh]`/`60vh`), which keeps the dialog itself inside the
  viewport so the title, the "add an athlete" row, the Done button and the
  X never scroll away. The global cap alone would have left those
  scrolling with the content.

Verified in a browser at 375×667 (iPhone SE) with an 18-member group:
dialog 544px tall inside a 667px viewport, list scrolling 960px of content
in a 334px window, and title/Add/Done all reported visible. Before the fix
that dialog would have been ~960px+ against a 667px viewport.

### Back buttons

`Layout`'s header had a hamburger and nothing else, so a drill-in page (a
meet, an athlete profile) had no way out on a phone except the browser's
back gesture — which an installed PWA doesn't have. Added a Back control
driven by `isDrillInPath()` (`lib/sectionTheme.ts`): any route that isn't a
bare top-level sidebar destination gets one. Shown at all widths, since
it's just as useful with a mouse. The standalone full-screen routes
(attendance, splits, timer, interval sessions) already had explicit Close
actions via `FieldHeader` and were left alone.

### Section colour scheme

User asked for "subtle beautiful gradients where the gradient range color
means something — if an athlete screen it is a certain color, if groups, if
coach views, etc."

`web/src/lib/sectionTheme.ts` maps route → section → a wash + a hairline
rule: athlete violet, groups teal, schedule amber (attendance and interval
sessions included), meets rose, analytics sky, Today slate. Applied in
exactly two places — `Layout`'s header and `FieldHeader` — so no page needs
per-page work and nothing can drift.

Constraints it holds to, so it stays a cue rather than decoration: the
colour is a gradient fading to transparent behind the *header only*, never
behind body content; every value is an alpha over the existing background
(`/10`, `/70`) rather than a hardcoded light-mode colour; the washes are
`aria-hidden` + `pointer-events-none`; and colour is never the only carrier
of meaning, always secondary to the title already there.

Two things the browser check changed:
- **Setup/admin is now deliberately uncoloured.** As zinc it sat next to
  Today's slate as two indistinguishable greys, which defeats the point of
  the scheme. Settings/data/billing are chrome rather than somewhere you do
  the work, so "no wash" is itself the signal.
- **Stacking.** The wash is `absolute`, and a positioned element paints
  above non-positioned siblings — so it covered the header text. Fixed with
  `isolate` on the header plus `-z-10` on the washes, which puts them above
  the header's own background but below its text, avoiding a wrapper around
  `TeamSeasonHeader` (a fragment of flex children that can't be wrapped
  without breaking the layout).

Dark mode: **not verified as shipping behaviour, because this app has no
dark mode yet** — `index.css` uses a class-based `.dark` variant and says
outright that nothing ever adds the class, so `prefers-color-scheme`
screenshots came back identical to light. Forcing `.dark` on the root
element confirms the alpha-based washes compose correctly against the dark
background, which is the reason for choosing alphas over fixed colours, but
that is a check of the tokens, not of a feature anyone can currently use.

Verification: `tsc -b`, `eslint` on all five changed frontend files, and
`npm run build` (web) all clean; backend `node --test` 340/341 (the usual
unrelated scraper-fixture failure — nothing backend was touched). The
375×667 dialog measurements and the light/dark wash screenshots came from
the same temporary harness technique as previous entries, **deleted again
afterward**. Not verified: the back button against real drill-in routes
with live data — `isDrillInPath` was reasoned against the router's actual
subpath list, not clicked through.

## Feedback becomes the maintainer's inbox — and closing a cross-tenant leak found on the way

User: "change the feedback tool to something that goes to me for me to see.
vallejo+xc@gmail.com is the superadmin. give me a screen that stores and
collects so I can give it back to you in an organized way."

Most of the machinery already existed — a `Feedback` model, a submit widget,
a review queue grouped by screen, triage, and a markdown export whose comment
already said "ready to hand over verbatim". So this was less "build a
feedback tool" than "make it actually be *yours*".

### The leak (the real finding)

`GET /feedback`, `PATCH /feedback/:id` and `GET /feedback/export` were gated
on `requireRole(['HEAD_COACH','COACH'])` — and none of them scoped the query
to the caller's own team. `mine=true` existed but was **opt-in**, so the
default response was every report from every team on the platform, including
each reporter's email address and raw console output. PATCH was equally
unscoped: any coach could re-triage any other school's reports. The route's
own comment read "Coach-only: reports can contain other people's email
addresses", which is precisely the risk it wasn't preventing.

All three are now `requireSuperAdmin` (the guard already existed in
`middleware/auth.js`, backed by the `SUPER_ADMIN_EMAILS` allowlist in
`lib/superAdmin.js`). `POST /` stays open to any signed-in user — a coach
hitting a bug in the field is exactly who needs it, and they are never a
super admin.

`test/feedbackAuth.test.js` (new, 3 tests) locks this down statically:
every route authenticates; only `POST /` is un-gated; and no route may use
`requireRole` at all. `routeAuth.test.js` could not have caught this — it
only checks that *non-GET* routes carry *some* guard, so `GET /` and
`GET /export` were invisible to it and `PATCH` looked fine with a coach role.
Confirmed non-vacuous by reintroducing the old guard and watching the suite
go red, then reverting.

### The inbox

`FeedbackPage.tsx` is now super-admin only (backend enforces; the page just
explains itself rather than spinning or throwing a bare 403 at a coach who
lands on the URL). Added: team name per report (resolved by mapping `teamId`
manually — `Feedback` deliberately has no FK to `Team` so a report outlives
the team it's about), severity filter and counts, free-text search across
message/screen/team/reporter, and two exports — "Copy as markdown" (open +
triaged, for pasting into chat) and "Download all" (everything, resolved
included, as a `.md` file).

The export got rewritten to be worth handing over: a summary line (totals,
untouched count, blocker count, timestamp), grouped by screen, **severity-
ordered within each screen so blockers lead**, and each entry stamped with
route/status/team/season/reporter/date, with triage notes and console errors
folded into a `<details>` block.

### Notification

**Correction to what this entry originally claimed.** It said there was "no
email provider in this codebase at all", on the strength of a package.json
grep for nodemailer/resend/sendgrid. That was wrong: `backend/lib/email.js`
is a working eusend wrapper (verified sending domain `mail.leadpack.cc`,
disabled by leaving `EUSEND_API_KEY` unset) and it is already called from
`routes/admin.js`, `routes/athletes.js` and `routes/team.js`. It uses raw
`fetch`, so it has no npm dependency for a package.json grep to find —
the wrong search, confidently read. Copy-the-link on invites is the
FALLBACK when the key is unset, not evidence that email doesn't exist.

So emailing feedback out was always available and cheap: one `sendEmail`
call in `POST /feedback`. The user's call, made after this was raised, was
"it can just be managed within the app" — so notification stays in-app: the
inbox plus an unread badge on the sidebar's Feedback item, fed by a new
`GET /feedback/unread-count` (its own tiny route so the sidebar doesn't
pull 500 rows on every page load). Left undone deliberately, not because it
was impossible.

### ⚠️ Action required before this works in production (still open)

`SUPER_ADMIN_EMAILS` must include `vallejo+xc@gmail.com` on Railway. The
allowlist is an env var read at request time (`lib/superAdmin.js`), not a
database flag, and this session cannot set Railway env vars. **If that
variable is unset or doesn't contain that address, the Feedback nav item
won't appear and the inbox will 403 — for everyone, including you.** Same
variable that gates the admin team switcher, so if that switcher is already
visible in production, this will work too.

Verification: `tsc -b`, `eslint` on both changed frontend files, and
`npm run build` (web) all clean; backend `node --test` 343/344 — the three
new tests pass, and the one failure is the same pre-existing unrelated
scraper-fixture gap. Not verified: the inbox against real feedback rows or a
live super-admin session (no live DB or auth in this sandbox), and the
unread badge's count endpoint has no test since it is a one-line `count()`
behind the guard that `feedbackAuth.test.js` already asserts.

## Manual race-results import — the scraper's insurance policy

User: "importing race results manually. that needs to be the feature that
prevents this app from not working if athletic.net tries to block the
scraper."

Surveyed first, because a lot of manual entry already existed. CSV import
was already there for the roster, field results, practice plans, the meet
calendar and splits; manual Meets/Races (`isManual`), per-athlete results
entry, and the live finish-order timer all existed too. **The one gap was
the scraper's actual core output**: a whole race's Results. The batch write
endpoint (`POST /races/:raceId/results`) takes `athleteId` UUIDs, which a
coach looking at a results page does not have and cannot get. So there was
no path from "I can see the results" to "they're in the app" other than
typing each athlete one at a time.

`backend/lib/resultImport.js` (new, pure, 22 tests) closes it. Two input
shapes, handled differently on purpose:

- **Delimited with a header** (`Place,Athlete,Time`, tab or comma) —
  unambiguous, parsed exactly, never guessed at. Tab beats comma when both
  appear, since a pasted table's cells often contain "Last, First".
- **Free-form pasted lines** — `1 Callum Woods-Vallejo 12 18:42.3 Kenwood`.
  Place and time extract confidently. Telling the *athlete* name from the
  *school* name does not, from the text alone. So the parser deliberately
  refuses to decide: it emits every plausible name span as a candidate and
  the route resolves them against the team's roster, which is the
  information that actually settles it. A school name only wins if a team
  really has an athlete by that name. Anything still unresolved goes to the
  coach with a dropdown rather than being guessed.

That "roster is the disambiguator" design has a useful consequence: pasting
an entire public results page (every school in the meet) just works —
everyone else's rows come back unmatched and are never offered for import.

`POST /meet-ops/races/:raceId/results/parse` is **read-only**. It returns
what it *would* write — matched, unmatched, duplicated, and the lines it
ignored — and the frontend then submits through the existing batch endpoint.
One write path, shared with manual entry and the live timer, so an import
can't half-apply and there's no second place for result-writing bugs to
live. `ImportResultsDialog.tsx` is the two-step UI (paste/upload → review →
import), reachable from a race's "Import Results" button next to Enter
Results and Live Timer.

### Two bugs the tests and a realistic dry run caught

1. **`+12pts` wasn't recognised as noise**, so it polluted name candidates —
   the points regex was anchored on `\d` and Athletic.net renders points
   with a leading sign. Fixed, and wind readings (`-1.2m/s`) covered too.
2. **The "Last, First" handling was dead on the real path.** Its unit test
   passed because it called `parseFreeformLine` directly; `parseResultsText`
   stripped *all* commas before ever reaching it, so `Woods, Tess` never
   matched `Tess Woods`. Found by running a realistic multi-school paste
   end-to-end rather than trusting green tests. Commas do two jobs here: a
   headerless-CSV delimiter (must become whitespace) and a name separator
   (must survive). Now split on the convention that a delimiter comma has no
   space after it and a name comma does. Regression test added **at the
   `parseResultsText` level** — the level that was actually broken.

Worth keeping in mind generally: a green unit test on a helper says nothing
about whether the caller reaches it the way the test does.

Verification: 22 new tests in `test/resultImport.test.js`, backend suite
365/366 (the one failure is the same pre-existing unrelated scraper-fixture
gap); `tsc -b`, `eslint` on all touched frontend files, and `npm run build`
(web) clean. Also ran a realistic five-line multi-school paste through
parse + resolve directly and confirmed all four cases behave: own-team
athletes matched, other schools left unmatched, "Last, First" resolved,
section headers and team-score lines reported as skipped rather than
silently dropped. Not verified: the dialog against a live race with a real
roster (no DB or auth in this sandbox) — the parse route itself is exercised
only through its pure lib, not over HTTP.

**Still deliberately not built**: importing whole *meets/races* in bulk from
a paste. Races can already be created manually and this covers the results
inside one, so the fallback is complete end-to-end; a bulk meet importer is
a convenience on top, not a gap in the insurance policy.

## Athlete profile: which groups they're actually in

User: as a logged-in coach, on an athlete's profile, show which captain's
group and which coach's group they're in, and whether they're in cross
training — "basically cross reference against other tables that we already
have."

Taken literally, which is the right scope: no new concept, no new state, no
writes. `GET /api/groups/athlete/:athleteId/memberships` returns every group
the athlete currently belongs to across all four types, and
`AthleteGroupsCard` renders it above Training Paces on
`TeamAthleteProfilePage`.

Two details that matter more than the endpoint itself:

- **Cross training uses `isMembershipActiveOn`, not `endDate: null`.**
  X_TRAINING memberships are bounded (GroupType's schema comment), so a
  stint that has expired — or hasn't started yet — still has a row and a
  plain `endDate: null` filter would report it as current. The existing
  helper already encodes that rule; reusing it is the whole point rather
  than writing a second date check that could drift from
  `getActiveMembersOf`.
- **Cross training is presented differently from the other groups**, not
  listed as a fourth row: it's the only temporary one, so the card shows the
  return date and the stated reason. That's what a coach actually needs to
  know from a profile.

Group leaders are included, since "which coach's group" is half the request
— a group is shown as "led by …" rather than leaving the coach to infer it
from the group's name. (The first draft returned `leaders: []` as a
placeholder; shipping an always-empty field would have been dead weight, so
it's populated from `GroupLeader` the same way `GET /groups` already does.)

Authorization: coach-tier sees any athlete on their own team; an athlete may
only request themselves, so this can't be used to enumerate teammates'
assignments. Same shape as the neighbouring
`/athlete/:athleteId/current` route.

Verification: `tsc -b` and `npm run build` (web) clean; backend suite 365/366
(unchanged — the same pre-existing scraper-fixture failure; no backend logic
was added beyond a read route). Not verified against live data (no DB or
auth here), so the card's empty state and the cross-training banner have
been reasoned about, not seen.

Noted, not touched: `TeamAthleteProfilePage.tsx` has a **pre-existing** lint
error (`setSelectedSeason` assigned but never used) — confirmed present with
my changes stashed, so it isn't from this work. Left alone deliberately: a
dead setter can mean an unfinished feature, and silently deleting it is a
behaviour question rather than a lint cleanup. It does mean `eslint` on that
one file is red until someone decides which way it goes.

## Athletes see their own groups too; and the "yesterday's practice" date bug

### The groups card, athlete-side

User: "does the athlete's own login have the same view. so they always
know." Now yes — `AthleteGroupsCard` also renders on `MyProgressPage` for
the signed-in athlete. No new endpoint or permission was needed: the
memberships route added in the previous entry already allowed an athlete to
read their own memberships and nobody else's, so this is the same card
against the same data. (Athletes also had a read-only "My Group" view on
GroupsPage already, but that's a separate destination — the point of this
request is that it's on the profile they already look at.)

### Two date bugs, only one of which explains the report

User: "i opened up today and it was showing yesterdays scheduled practice
not todays."

**The one that caused it: a stale react-query key across midnight.** The
date was computed inline during render (`todayIso()` called in the component
body). That is right exactly once. On a phone the app isn't reloaded
overnight, it's *resumed* — and while react-query does refetch on window
focus, it refetches **the key it already has**. Nothing re-rendered the
component with a new date, so the key still said yesterday and the refresh
faithfully re-fetched yesterday's plan. Which looks exactly like caching,
and is, but not the kind a `staleTime` change would fix — the cache was
working correctly, it was being asked the wrong question.

New `useTodayIso()` makes the day a piece of state and changes it on:
a timer armed for the next local midnight (re-armed each fire rather than a
drifting interval), plus `focus`/`visibilitychange` — which is the case that
actually matters, and which coincides with react-query's own refetch, so the
new key and the refetch line up.

**The one found while looking: every "today" in this app was UTC, not
local.** `new Date().toISOString().slice(0, 10)` was used in a dozen places
and yields the *UTC* date. Verified concretely rather than assumed — at
7:30pm Pacific on Aug 26 that expression returns `2026-08-27`:

    America/Los_Angeles  local: 2026-08-26  UTC: 2026-08-27  <-- DISAGREE
    America/Chicago      local: 2026-08-26  UTC: 2026-08-27  <-- DISAGREE

So from late afternoon onward, a US coach's "today's practice" was
tomorrow's, and every date-defaulted form (new meet, duplicate interval
session, log a run, attendance week) pre-filled the wrong day. Note this is
the **opposite** direction from the reported symptom — it shows tomorrow in
the evening, never yesterday in the morning — so it is a second, independent
bug that happened to be sitting next to the first, not an alternative
explanation for it.

Fixed with `localIsoDate(d)` / `todayIso()` in `formatUtils`, built from
`getFullYear/getMonth/getDate` so no conversion is involved at all, and
applied across TodayPage, MyProgressPage, MeetsPage, IntervalSessionsPage
and AttendancePage. `AttendancePage`'s `addDays` was deliberately left as-is:
it parses and formats a `YYYY-MM-DD` string consistently in UTC, so there's
no local/UTC ambiguity to fix there.

Verification: `tsc -b`, `eslint` on all eight touched files, and `npm run
build` (web) clean; backend 365/366, unchanged (frontend-only). The
timezone divergence was demonstrated by running the old and new expressions
under four TZs rather than reasoned about. **Not verified**: `useTodayIso`'s
midnight/focus behaviour — there is no frontend test runner in this repo and
this sandbox can't hold a session open across a real midnight, so the hook
is reasoned from the event model, not observed. Worth a deliberate check:
leave the app open overnight (or shift the device clock past midnight) and
confirm Today rolls over on focus.

## Invite sign-up dead end, missing password-reset routes, and wrong split averages

Three reports, three genuinely different causes.

### 1. "Signed up, created a password, then got an invalid/unauthorized link" — while the account HAD joined

Root cause found in code, and it explains the contradiction exactly:
`StaffInviteAcceptPage`'s effect depends on `[token, currentUser,
acceptStaffInvite]`, and `acceptStaffInvite` **itself refreshes
currentUser**. `AuthProvider` builds a brand-new user object and a brand-new
function identity on every render, so:

1. effect runs → POST accept → succeeds, invite marked `accepted`
2. the same call then refreshes `currentUser` → AuthProvider re-renders
3. both deps have new identities → **effect re-runs**
4. second POST finds `invite.status !== 'pending'` → backend correctly
   answers 404 "This invite is no longer valid."
5. the page overwrites its own success with a red error

So the coach really had joined the team; the screen was reporting the
*second* attempt. `InviteAcceptPage` (athlete invites) had the identical
shape and the identical bug.

Fixed with a one-shot `attemptedTokenRef` guard per token in both pages —
the essential fix, since an effect that performs a one-time state-changing
action cannot rely on its dependency list — plus `useCallback` on
`acceptInvite`/`acceptStaffInvite`/`claimTeam` so the identity churn stops
at the source. `ClaimTeamPage` was already safe (`deps: [token]` only).

Also new `lib/apiError.ts`. The backend is split ~409 `{ msg }` vs ~73
`{ message }`, and the `message` group includes **middleware/auth.js**, so
every 401/403 used the key none of the pages read — each had its own copy
of a reader that only checked `msg`, so auth failures surfaced as axios's
useless "Request failed with status code 401". Reading both is the right
fix rather than renaming 400+ backend responses.

### 2. Password reset "just generates an error"

Not a bug in a reset flow — **there was no reset flow to reach**.
`NeonAuthUIProvider` declared `viewPaths` for `SIGN_IN` and `SIGN_UP` only,
and the router had `/login` and `/register` only. But the sign-in form
always renders a "Forgot password?" link, and the library resolves it
against its own defaults (verified against the installed source,
`@daveyplate/better-auth-ui/src/lib/view-paths.ts`: `forgot-password`,
`reset-password`, `callback`, …). That link therefore pointed at a route
that did not exist, fell through to the authenticated shell, and surfaced as
an authorization error. The emailed reset link (`/reset-password?token=…`)
had the same problem, so a reset could not be completed even if triggered
another way.

Added `AuthFlowPage` plus routes for `/forgot-password`, `/reset-password`
and `/auth/callback`, and declared all of them in `viewPaths` so the
library's links and the router agree.

### 3. Split averages wrong, "especially if there aren't very many"

Two real defects in `lib/splitAggregates.js`, both worst at small n — which
is why they were noticed:

- **`average()` summed raw values.** A `null` coerces to 0 in JS, so
  `average([300, null, 320])` returned **206.7, not 310**, and an
  `undefined` produced NaN. Now ignores non-finite values and returns the
  count it actually used.
- **Buckets mixed marker schemes.** Races were bucketed by distance alone,
  so two 5Ks — one marked in miles (~1609m segments), one in kilometres
  (1000m segments) — had their segments averaged positionally and the result
  labelled "Mile 1". `splitMarkerScheme` is per-race and nullable, so this
  is live, not hypothetical. Buckets are now keyed by distance AND scheme,
  and labels come from the scheme (`1K`, `Split 1`) instead of a hardcoded
  "Mile N".

Also: `raceCount` was reported for a position while the pace average was
computed over a *filtered* subset, overstating what the number came from.
Now `segmentRaceCount`/`paceRaceCount` are reported separately, and the UI
shows "N of M" when a position covers fewer races than the bucket.

**Nearly shipped dead:** `buildAthleteSplitRows` in `routes/splits.js` did
not include `splitMarkerScheme`, so every race would have defaulted to MILE
and the bucketing fix would have had no effect on the real path while its
tests passed — the same trap as the "Last, First" parser two entries ago.
Caught by checking the caller before committing, not by the tests.

Verification: 4 new tests in `splitAggregates.test.js`, written first and
confirmed failing (4 fail) before the fix, then passing (13/13). Backend
suite 369/370 — the one failure is the same pre-existing scraper-fixture
gap. `tsc -b`, `eslint` on all touched frontend files, and `npm run build`
clean. The corrected bucketing was also run end-to-end over mixed MILE/KM
input to confirm the buckets separate and label correctly.

**Not verified**, and worth a real check: none of the three fixes has been
exercised against a live session. In particular the invite fix is reasoned
from the render/dependency model rather than observed, and the password
reset routes depend on the auth provider actually being configured to send
reset email — if `EUSEND_API_KEY` is unset in production the form will
render and accept an address but no email will arrive, which will look like
a different bug.

Noted, not touched: `main.tsx` and `TeamAthleteProfilePage.tsx` each carry a
**pre-existing** lint error (confirmed by stashing this work and re-running).
Left alone as unrelated.

## The invite 403 — four bugs wearing one costume

"I can't resend an invite, 403." One symptom, four independent causes, any
one of which produces it on its own. Worth writing down as a pattern: a
report that sounds like a single bug can be a *class* of bug, and the first
plausible cause you find is not evidence that it is the only one.

### 1. The bearer token was never refreshed (the big one)

`AuthProvider` called `getJWTToken()` once when the session synced and
pinned the result on `api.defaults.headers.common['Authorization']` for the
life of the tab. Neon Auth JWTs are short-lived. Past their `exp`,
`middleware/auth.js` answers **403 "Invalid or expired token."** — not 401 —
to *every* request.

What made this hard to see: react-query still had the GETs cached, so the
screen looked completely normal. Nothing degrades. The first thing you
*click* fails, which reads as "this particular button is broken" rather than
"my session is dead." Open a screen, come back later, press a button, get a
403 on an action you obviously have permission for.

`api/axios.ts` now fetches the token in a request interceptor. That is not
the expensive thing it looks like: `@neondatabase/auth` caches the session
and derives that cache's TTL from the JWT's own `exp` minus a clock-skew
buffer (`adapter-core`'s `SessionCacheManager`), so it returns the in-memory
token with no network call until it genuinely needs a new one. Neon's own
`createClient` passes `getJWTToken` as the per-request token source for its
data API — the primitive is designed to be called this way.

### 2, 3. Two UI gates that did not match their server gate

Both showed a live-looking button that could only ever answer 403:

- **`RosterPage`** gated its whole editing toolbar on
  `currentUser.role === 'coach'`. That is the sticky UX hint, and
  `authenticate` deliberately sets it to `'coach'` for `VOLUNTEER_COACH`
  too (so real staff get the coach sidebar). But *every* route behind those
  buttons is `requireRole(['HEAD_COACH','COACH'])` or tighter — none accept
  `VOLUNTEER_COACH`. A volunteer coach saw sync, import, join code, captain,
  nickname, invite/resend and preview-as-athlete, and every single one 403s.
- **`StaffManager`** gated Resend on `isSuperAdmin` alone. `requireRole`
  waves the super admin through only when `isImpersonating` is *also* set —
  i.e. once an `X-Admin-Team-Id` has actually resolved to a team.

The rule this suggests: **a UI gate must be written from the same fact the
server's gate reads.** `TeamMember.role` (exposed as `teamRole` by
`GET /users/me`) is that fact. `User.role` is not, and never was.

### 4. Nothing said what was wrong

`StaffManager` and `RosterPage` each had their own error reader that checked
only `response.data.msg`. Every 401/403 from `middleware/auth.js` uses
`message`. So the real reason ("Invalid or expired token", "Access denied")
was thrown away and the toast fell back to axios's `"Request failed with
status code 403"`. Both now use `lib/apiError`'s `getApiErrorMessage`, which
reads both keys — it was written last session for exactly this and had not
been adopted here yet.

This is the part that turned a five-minute diagnosis into a long one, and
it is worth being blunt about: **an error path that discards the server's
own explanation is not a cosmetic problem.** Three of the four causes above
would have named themselves.

## Making the web app installable (PWA), and a config that was never running

The plan is the PWA first — cheap, reversible, and it answers whether
"native app" was ever about the App Store or just about the app feeling
like it belongs on a phone.

### The stale artifact that had to go first

A compiled **`vite.config.js` was committed next to `vite.config.ts`**, and
**Vite resolves `vite.config.js` first**. So for the entire life of this
project the real config was dead code and every build ran the minimal
leftover instead. Visible proof: the `manualChunks` and hashed
`[name].[hash].js` filenames configured in the `.ts` had never taken effect
— builds emitted one 2.4MB `index-<hash>.js`. After deleting the `.js`, the
same build splits into vendor/router/ui/charts as intended.

Adding a plugin to a file nothing reads would have silently done nothing,
which is a bad way to find out. Its two unique settings (dev server
port/host) are carried into the `.ts`; `tsconfig.node.json` now emits its
`.d.ts` into `node_modules/.tmp` and both artifacts are gitignored, so the
pair cannot come back. That config's `manualChunks` also still named
`firebase`, which stopped being a dependency when this app moved to Neon
Auth.

Generalising: **an artifact whose filename shadows a source file is a
silent, permanent bug.** Nothing errors. Nothing warns. Every result is
merely wrong in ways that look like something else.

### Decisions in the PWA setup

- **`registerType: 'prompt'`, not `'autoUpdate'`.** `autoUpdate` reloads the
  page as soon as a new build's service worker takes over. On an attendance
  grid or the live timer that is a reload in the middle of unrecoverable
  work. New versions install quietly; `src/registerServiceWorker.ts` offers
  a toast with an Update action and no auto-dismiss.
- **Nothing caches `/api`.** Workbox's navigate fallback will answer an API
  request with `index.html` unless denylisted, and in production the backend
  is same-origin under `/api`. Beyond that: every number this app shows is
  one a coach acts on, so a stale-but-plausible roster is worse than an
  honest failure. Offline means "the app opens and says it can't reach the
  server", not "the app shows you yesterday's answers". Real offline
  *capture* is a much bigger piece of work (a write queue with conflict
  rules) and is deliberately not started here.
- **Icons are the LP mark the landing page already uses**, not a nicer new
  one — same gradient, same 30% corner radius. First attempt was an
  invented chevron mark; matching the logo a coach already associates with
  the app matters more. Separate full-bleed art for `apple-touch-icon`
  (iOS applies its own corner mask, so shipping pre-rounded double-rounds
  it) and for the maskable icon (inset to the central 80% safe zone).
- **No `viewport-fit=cover`.** Without it iOS keeps a standalone web app
  inside the safe area by itself, so nothing needs `env(safe-area-inset-*)`
  padding and no fixed element can slide under a notch. Edge-to-edge is a
  look, not a feature, and it would need every fixed element audited first.

### Verified, in headless Chromium against a production build

Service worker registers and controls the page; manifest and all four icons
resolve; deep links (`/t/:id/attendance`, `/settings`) still serve the app
shell with the network switched off; `/api` requests are not answered by the
service worker either online or offline (checked offline specifically —
while online, `vite preview`'s own SPA fallback returns `index.html` for
`/api/*` and would mask the difference).

**Not verified:** actual installation on a real iOS or Android device, the
update toast (needs two deployed builds), and whether `theme_color` looks
right against the real status bar. The token-refresh fix has also not been
exercised against a live expiring session — it is reasoned from the library
source, not observed.

**Noticed, not fixed:** the landing page header overflows at 390px width —
the "Get Started" button is clipped off the right edge. Pre-existing and
unrelated to any of this.

## Team-defined pace zones, and what the numbers turned out to say

A team can now write down what its own pace terms mean, and training paces
are calculated from those definitions rather than from a fixed set of ours.

### The vocabulary

Coaches write pace zones relative to RACE performances, always. Two rule
shapes covered every definition we were given:

  OFFSET  "Distance = 2-3 minutes slower than best 1 mile time"
  RANGE   "VO2 = 2 mile to 5k race pace"

Both produce a pace RANGE, not a single number, because that is how they are
written. Equal ends give an exact pace. The good sign that the vocabulary is
right: the shipped McMillan-style defaults are expressed in it too — they are
nothing but zones a coach could have typed.

### Defaults are a constant, not rows

`MCMILLAN_ZONES` lives in `web/src/lib/paceZones.ts` and is never written to
the database. That buys three things: it can be corrected without a data
migration, no team can edit it into something wrong, and a team with zero
custom zones is in the normal state rather than a misconfigured one. The
migration deliberately seeds nothing, so it cannot change what any existing
team sees.

Custom and standard zones render side by side, separately labelled, never
merged. A team's "T" and the standard "T" are different definitions;
showing one under the other's name is how an athlete runs the wrong workout.

### On McMillan, stated plainly

His published pace tables are his own work and are not reproduced here. What
is implemented is the zone structure and the race-pace relationships he
describes in prose, computed by a Riegel equivalent-performance model. The
UI says "McMillan-style" for exactly that reason — same posture
`vdotPaces.ts` already takes about Daniels' tables.

### Riegel's limit, documented rather than hidden

Riegel compresses at short distances. From an 18:00 5K it predicts 5:11/mi
for 800m against 5:25/mi for the mile — 14 seconds apart, where a real 5:25
miler races 800m nearer 4:50/mi. So zones anchored on 800m-1600m (the
default Speed zone, EHS's R) come out CONSERVATIVE, and the error grows the
shorter the anchor. It is stable and predictable rather than erratic, which
is why a single well-understood model still beats blending two, but it is
written at the constant so nobody has to rediscover it.

### What the numbers said about EHS's own definitions

Computing the EHS set for an 18:00 5K runner (equivalent mile 5:25, 5K
5:48/mi) surfaced something worth raising:

| Zone | Rule | Result |
|---|---|---|
| DIS | mile +2:00..+3:00 | 7:25 - 8:25 |
| SS | mile +1:30..+2:00 | 6:55 - 7:25 |
| T | mile +1:00..+1:30 | **6:25 - 6:55** |
| T | 5k +0:30 (the "or") | **6:18** |
| VO2 | 2mi..5k | 5:39 - 5:48 |
| R | 800m..mile | 5:11 - 5:25 |

**Threshold's two formulations disagree.** The mile-anchored version is up to
37 sec/mile slower than the 5k-anchored one. Only one can be the computed
rule; the other is kept as the zone's notes so nothing the coach wrote is
silently dropped. There is a test asserting they disagree, so that if the
engine ever quietly makes them agree someone has to come and look at why.

### Vitest, finally

Added to the web package with this feature. The engine is pure arithmetic,
this project's rule is that arithmetic gets its test written first, and
there was no frontend runner at all — every frontend calculation to date
(VDOT paces, PR bucketing, split maths) had been verified only by reading
it. 47 tests now run on `npm test` in `web/`.

It is a separate `vitest.config.ts`, not a `test` block inside
`vite.config.ts`: Vitest 4 ships rolldown-flavoured config types under which
the build's object-form `manualChunks` stops type-checking, so merging them
fails `tsc -b` on a setting that is correct and working.

### Five bugs found by driving the editor, not by reading it

The same lesson as the harness work earlier this session, and it keeps
paying:

1. **Rep splits showed tenths** — "1:17.4-1:20.7". A tenth is right for a
   time somebody ran on a stopwatch; on a modelled target it is false
   precision, and it is harder to read at the track. Whole seconds now.
2. **Easy pace was getting 400m rep splits.** The first gate was an absolute
   7:30/mi ceiling, which Easy squeaked under. Worse, an absolute cutoff
   silently denies rep targets to every slower athlete — a 25:00 5K
   runner's real interval pace is around 7:30/mi. Now measured against the
   athlete's own 5K pace, which scales across the roster.
3. **A failed GET left the editor permanently unsavable**, because `dirty`
   required `saved !== undefined`. The symptom was confusing; the risk
   underneath was worse. Saving REPLACES the whole set, so saving on top of
   a set we failed to read would have deleted it. Editing is now blocked
   with an explanation and a retry, which is the honest response.
4. **Offset fields were uncontrolled** (`defaultValue` + `onBlur`), so
   "Discard changes" left the abandoned text on screen.
5. **Two selects overlapped** — "Slower/faster than a race pace" ran out of
   its `w-44` trigger into the next field.

None of these would have been caught by the tests, and none were visible in
the source.

### Deliberately not done

- **Interval sessions still use the Daniels/VDOT engine.** `IntervalSession.zone`
  is a stored enum of `threshold|interval|repetition`, and pointing it at
  team-defined zones needs its own migration and a decision about what
  happens to existing rows. `vdotPaces.ts` is untouched and still backs
  that and the VDOT Calculator.
- **No "reset to defaults" button.** Deleting every custom zone already gets
  you there.
- **Anchor distances are a fixed list, not a free number field.** Every entry
  is a race a coach names out loud, and an open metres box invites the "I
  typed 1 for one mile" error that the server has to reject anyway.

**Not verified:** none of this has run against a live database — the
migration is unapplied here, and the save path was exercised against a
stubbed API in a browser, not against Postgres. The unique index on
(team_id, abbreviation) in particular has never actually rejected anything.

## Interval sessions on the team's pace zones

The suggested per-rep targets on an interval sheet now come from the team's
own zone definitions plus the McMillan-style defaults, replacing the fixed
Daniels/VDOT trio.

### The problem that had to be solved first

A session stores WHICH zone its targets come from. Saving the zone set is a
delete-then-insert, so **every custom zone gets a fresh uuid on every save**
— a session holding a `PaceZone.id` would have been orphaned the first time
a coach edited an unrelated zone. That is a bug the previous commit created
and this one had to notice before writing any UI.

So `interval_sessions.zone` holds a **stable key**, never a row id:

    mcm-vo2     a default zone, by its constant id
    team:DIS    a team's own zone, by abbreviation — already unique per
                team at the database level, and unchanged by a save

`backend/lib/paceZoneRules.js` owns that vocabulary server-side,
`web/src/lib/paceZoneLookup.ts` client-side. Because the default keys are
now duplicated across a language boundary,
`backend/test/paceZoneKeys.test.js` **reads MCMILLAN_ZONES out of the
frontend TypeScript** and fails if the two lists drift. Same class of
problem as the `splitMarkerScheme` near-miss: verify the two halves agree
rather than trusting that they do.

### Migrating existing sessions

    threshold  -> mcm-tempo
    interval   -> mcm-vo2
    repetition -> mcm-speed

These are the same zones under different authors' names — Daniels'
Threshold is a tempo effort, his Interval is VO2max work, his Repetition is
short speed work. Only the label changes; no session's meaning is
reinterpreted.

### zone_label, and why a snapshot is not redundant

The live definition is preferred, so retuning or renaming a zone updates
in-progress sessions. But a coach who **deletes** a zone in December would
otherwise turn October's sheet into a session labelled with a dangling key.
So the name is snapshotted at creation and used as the fallback. The raw key
is the last resort, deliberately ugly: a sheet showing `team:GONE` is a
visible problem a coach reports, one showing a plausible wrong name is not.

### Targets are ranges now

Zones are ranges, so targets are: "3:03-3:13", collapsing to one number when
both ends round to the same second. **Recorded rep times keep their tenth,
targets do not** — a recorded time came off a stopwatch, a target came out of
a model, and carrying a tenth on the latter was false precision. The old
`T = ` prefix is gone as redundant with the "Target" column header above it.

### The picker offers everything now

The old list had three zones because Daniels' Easy and Marathon paces have no
meaningful repeat split. But a coach who wrote their own vocabulary and wants
6 x 1000m at steady state is not making a mistake, and it is not this
screen's job to tell them so. Team zones list first (those are the words used
at practice), then the standards marked "(standard)", each showing its rule.

Worth noting the picker handles the collision case cleanly by accident of
good naming: a team with a zone abbreviated "T" sits directly above the
standard "T · Tempo (standard)". Different names, different keys
(`team:T` vs `mcm-tempo`), and a test covers exactly that.

### Verified in a browser, three cases

| Case | Header | Target |
|---|---|---|
| team zone | "VO2 Max pace" | 2:48-2:53 |
| default zone | "Tempo pace" | 3:03-3:13 |
| zone deleted since | "Old Sprint Zone pace" (from the snapshot) | — |

Per-athlete targets differ correctly: an 18:00 and a 21:30 5K runner get
2:48-2:53 and 3:21-3:26 for the same 800m session.

### Harness lessons, both mine

Two self-inflicted delays worth writing down, because both will recur:

1. **A `**/api/**` Playwright route intercepts Vite's own module requests**
   for anything under `src/api/`, and the page fails with a MIME-type error
   that says nothing about routing. Scope stubs to the API origin.
2. **Playwright resolves the most recently registered matching route first.**
   A catch-all registered last silently shadows every specific stub before
   it. Register the catch-all first.

**Not verified:** no live database, so the migration is unapplied and the
legacy zone mapping has never actually rewritten a row. The zone-key
validation path (`zoneKeyError`) has not run against real PaceZone rows
either.

## Nerd mode

One switch in the sidebar footer, app-wide. Off, nothing changes anywhere.
On, every derived number carries the formula, the actual substituted
arithmetic, and the file and function that produced it.

### The one decision the whole design turns on

The brief was not only "show how it was applied" — it was "reinforce
confidence that it is calculated correctly." Those pull in different
directions the moment you consider maintenance. A panel of hand-written
formula strings sitting *beside* a calculation will eventually drift from
it and start quietly lying, and a coach who catches nerd mode contradicting
the number next to it ends up trusting the app **less** than before the
feature existed. That is a worse outcome than not building it.

So no explanation in this feature is written next to a calculation. Every
one is **produced by** the calculation, as a by-product of doing it:

- `resolvePaceZone` builds an `explain` trace while it computes, and
  returns it alongside the pace.
- `explainRepTarget` appends its step inside the same function that does
  the multiplying.

And then the guard that makes it true rather than merely intended:
`paceZones.test.ts` asserts **the last step's stated value equals the value
actually returned**, for every default zone and both rule shapes. A change
that updates the maths and forgets the trace fails the build instead of
shipping a panel that disagrees with the number beside it.

If nerd mode gets extended to another calculation, that is the contract:
the trace comes out of the function, and a test pins its final value to the
returned one.

### Two defects found by looking, not reading

Both would have undercut the entire point:

1. **The trace rounded intermediates to the second, so it did not reproduce
   by hand.** "2:35 ÷ 0.497 mi" is 5:12, displayed next to a 5:11. Someone
   checking the arithmetic finds a discrepancy that is pure display
   rounding and concludes the app is wrong. Intermediates now carry a
   tenth ("2:34.8 ÷ 0.497 mi = 5:11") and it works out.
2. **A RANGE zone's joined sub-derivations dropped the formula**, leaving
   substituted numbers with nothing saying why. The substitution shows
   WHAT happened; the formula is the half that explains anything.

A third, smaller: the substituted line was `whitespace-nowrap` with
horizontal scroll, which in a narrow card just reads as a clipped, broken
equation with no affordance saying there is more. It wraps now — the
strings are built with spaces around every operator so breaks land between
tokens.

### Where the panels are, and why there

| Surface | Form |
|---|---|
| Training paces (athlete profile, My Progress) | Full derivation per zone, **below** the rep splits — it is meta content, and a coach reaching for a rep target shouldn't scroll past algebra |
| Pace zone settings | Under the standard previews and the live editor preview, which makes that screen a place to CHECK a rule you just typed |
| Interval sheet | Full derivation **once** above the table, worked through for a named athlete on that sheet, plus one compact line per row with that athlete's own numbers |
| Split averages | Counts only — see below |

The interval sheet split is deliberate: a six-step box per row would bury a
grid used on a phone at the track.

**Split averages are the honest exception.** They are computed server-side
(`backend/lib/splitAggregates.js`) and never recomputed on the client, so
there is no client-side trace to emit. Rather than invent a derivation,
nerd mode there reports what the server actually returned — how many races
each mean was taken over, separately for split and pace, and that
non-numeric splits are excluded rather than counted as zero. Which is
precisely the bug that was once live in that function. Giving it a real
trace would mean returning one from the API; not done.

### Mechanics

`NerdModeProvider` is mounted **above the router** in `main.tsx`, not in
`TeamRouteGuard` where `SeasonProvider` lives — it has to reach the
full-screen routes that render outside `<Layout>` (live timer, interval
sessions, splits entry) and `/profile`, which sits outside the team-scoped
subtree.

localStorage, read lazily in `useState`'s initialiser so the first paint is
already correct (an effect would flash every panel in a moment after load).
Every read and write is wrapped — private browsing throws on access, and
that is not a reason to fail to render the app. It is a per-person,
per-device display preference like a zoom level, so: no schema change, no
round trip, no team setting.

`NerdBox` returns `null` when the mode is off — no wrapper, no reserved
space, no layout shift. Verified: page height and DOM are identical with it
off.

### Not done

- **The VDOT calculator, group analytics, PR bucketing and the band/program
  screens have no panels yet.** The pattern is established and cheap to
  extend, but each needs its calculation to emit a trace first, and for the
  server-side ones that means an API change.
- No per-user default — it starts off for everyone, every device.
