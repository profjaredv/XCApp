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
