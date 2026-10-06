# LeadPack: Track & Field

Handoff for Claude Code. Self-contained. Read the whole document before writing any code.

The demo this is built for: Jared coaches Ellensburg High School XC and will be standing at a booth at the WA state track and field conference in January. The pitch is not a mockup. It's loading Ellensburg's own historical track results and showing a coach, live, multi-season history they already lived through, analyzed in a way they've never seen it. Every workstream below is sequenced so that demo works on real data, not fixture data.

Companion documents: `LeadPack-master-handoff.md` (the XC product this extends), `XCApp-red-team-audit.md`. The rules of engagement there apply in full: do not invent data, do not add unspecified features, do not fix a problem by adding a second implementation, write the test before the fix for anything arithmetic, stop and ask when ambiguous.

## 0. What transfers and what doesn't

Said once here instead of re-litigated per section.

Transfers almost unchanged: `TeamMember`/`TeamRole`, `Group`/`GroupLeader`/`GroupMembership`, `PracticePlan`/`PracticePlanAssignment`/`WorkoutTemplate`, `Meet`/`MeetEntry`/`MeetPlan`, `RaceReflection` (process/outcome goals work the same for a 400m as a 5K), `Equipment`, the entire claim-and-checkout gate, `TeamClaim`, `requireActivePlan`, Stripe wiring, the nav shell, Today. None of that knows or cares what sport it's attached to. Build on it; do not rebuild it.

Doesn't transfer: everything downstream of `Race`/`Result`. That stack assumes a single timed distance event where lower is always better. Track breaks every piece of that assumption at once: a mark can be a time, a distance, or a height; "better" flips direction by event; a result can belong to four athletes simultaneously (a relay); rounds exist (prelim, semi, final) where XC has none. This is genuinely new, not a reskin, and it's where the real work is.

## 1. One team, two sports — confirmed, with a real finding attached

Ellensburg's Athletic.net team ID is shared across sports: `athletic.net/team/460/track-and-field-outdoor/2026/event-records` is team 460, same ID the XC scraper already uses. So `Team.athleticTeamId` stays `@unique` as it already is, the existing `Season.sport` hook was the correct original intent, and no `Team`-splitting is needed. Track becomes a second set of `Season` rows (`sport: "TRACK"`) under the same `Team`, same `TeamMember` roster, same `Athlete` records. This is simpler than this document originally assumed and removes a whole category of cross-team athlete-matching work — an athlete who runs both sports is already the same `Athlete` row, no linking required.

That URL also surfaced something worth acting on before Section 4. It's a different URL scheme from the XC scraper's `Season.aspx?SchoolID=...` query-string pages — this is a newer per-team hub (`/team/{id}/{sport-slug}/{year}/{page}`), and fetching it plain returned only page metadata, no content, which means it's rendered client-side and needs Playwright, not a lighter-weight request. The track scraper is not "the XC scraper pointed at a new base URL." It needs its own navigation logic for a differently structured site.

And `event-records` specifically is very likely the wrong page for season-by-season import. It reads like an all-time or season-best leaderboard, not a meet-by-meet results log. Before writing the scraper, open that team hub in a real browser and find the actual results/schedule page — it's a sibling of `event-records` under the same `/team/460/track-and-field-outdoor/2026/` path, not something to guess at from this one URL.

### 1a. Nav and dashboard become sport-aware

With one `Team` row covering both sports, "Season" can no longer be a single dropdown, because it now has to resolve to either an XC season or a Track season, and a plain year picker could imply a combination that doesn't exist (there is no Fall Track season). Merge sport into the season picker itself — one dropdown listing every `Season` row as a combined label, "Fall 2026 · Cross Country" next to "Spring 2027 · Track & Field," rather than two separate pickers that could be set to an invalid pair.

- Athletes, Groups, Equipment, Setup stay exactly as they are. The roster is the roster regardless of sport; nothing here is sport-specific.
- Practice, Meets, Season (dashboard), and Program should become sport-aware for free, if and only if they are already scoped by `seasonId` rather than inferring sport some other way. Verify this before assuming it — a page that currently derives "current sport" from a team-level default rather than the selected season's own `sport` field will silently show the wrong sport's data the moment a team has both.
- The Season dashboard and Program page need a branch, not a merge. XC's pace-band math and Track's points-contribution/PR-progression math are different domains computed differently; don't try to build one generic "season dashboard" that awkwardly serves both. Branch on `season.sport` at the top of each page and render the appropriate view. Shared chrome (header, season picker, roster count) stays common; the content underneath does not.
- Today needs a guard, not a redesign. It already resolves "the active season" (build spec Section A2); the only new case is a team with an active XC season and an active Track season at once, which shouldn't normally happen given the fall/spring calendar split but is worth an explicit check rather than silently picking one.

### 1b. Staff can be sport-scoped; `TeamMember` currently can't express that

The track head coach may not be the XC head coach. `TeamMember` today has one role, team-wide, with no sport dimension — so a track-only coach added as `HEAD_COACH` would also get destructive authority over XC results, training logs, and race reflections. That's the staff-side version of the exact over-broad-access problem the captain allowlist exists to prevent on the athlete side, and it needs closing the same way.

Add a nullable scope:

```prisma
model TeamMember {
  ...
  sport String? @map("sport")   // null = this member's role applies to every sport
                                 // on the team; "XC" or "TRACK" narrows it to one
}
```

One `TeamMember` row per user per team, as today — `sport` narrows what that row can touch, it doesn't multiply rows. Migrate every existing row to `sport: null` (unrestricted), which is both the safe default and almost certainly correct for anyone already on staff today.

Enforcement reuses the pattern `lib/groupPermissions.js` already established for volunteer coaches, rather than inventing a second permission system. That file already scopes a `VOLUNTEER_COACH`'s writes to the groups they lead; extend the same shape to check `teamMember.sport === null || teamMember.sport === resource's season's sport` on season-scoped writes (`Season`, `Group`, `PracticePlan`, `Meet`, results import, `TrackResult` writes). A coach scoped to `TRACK` gets full `HEAD_COACH` authority within track and none within XC.

`StaffInvite` needs the same field. Add `sport String?` so Jared can invite a track-only head coach with that scope already set on the resulting `TeamMember` row, rather than inviting them unrestricted and narrowing after the fact.

Captains don't need this change. `SeasonRoster.isCaptain` is already season-scoped, and a season already carries its own sport, so captain access is correctly sport-scoped today without any new field. This is a staff-only gap.

## 2. Event catalog

Track events are a fixed, enumerable set, unlike XC's free-text distance. Model them as reference data, not user-created rows.

```prisma
enum EventCategory {
  SPRINT
  MIDDLE_DISTANCE
  DISTANCE
  HURDLES
  RELAY
  JUMP
  THROW
  MULTI
}

enum MarkUnit {
  SECONDS
  METERS
  FEET_INCHES   // stored internally as total inches; see Section 2 hazard below
  POINTS        // multi-event aggregate score
}

enum ScoringDirection {
  LOWER_BETTER
  HIGHER_BETTER
}

model Event {
  id               String            @id @default(uuid()) @db.Uuid
  name             String            @unique   // "100 Meters", "Long Jump", "4x400 Relay"
  category         EventCategory
  unit             MarkUnit
  scoringDirection ScoringDirection
  isRelay          Boolean           @default(false)
  relayLegCount    Int?                        // 4 for 4x100/4x200/4x400/4x800
  isMultiEvent     Boolean           @default(false)
  sortOrder        Int               @default(0)   // for a sane event order in the UI

  @@map("events")
}
```

Seed a WIAA-typical outdoor list (100m, 200m, 400m, 800m, 1600m, 3200m, 100m/110m Hurdles, 300m Hurdles, 4x100, 4x200, 4x400, 4x800 Relay, High Jump, Long Jump, Triple Jump, Pole Vault, Shot Put, Discus, Javelin) as a seed script, but confirm the exact contested event list against WIAA's current rules or Ellensburg's own meet results before treating the seed as final — event offerings vary by classification and some leagues don't run every event. Don't hardcode confidence you don't have.

**Hazard: field event units are not metric on Athletic.net**

US high school field events are recorded in feet and inches on Athletic.net, not meters. A long jump of 18 feet 6 inches reads as `18-06` or `18'6"` on the page, not `5.64`. This is the exact shape of bug that corrupted `"5,000 Meters"` in the XC parser: an innocent-looking string that silently means something different than it appears to. Getting this wrong doesn't error, it just quietly makes every field-event PR wrong by a large, confident-looking margin.

Store `MarkUnit.FEET_INCHES` marks as total inches internally (an integer), convert to a display string (`18' 6"`) at render time, and write the parser's test table from real scraped field-event strings before trusting it, the same way `lib/distance.js`'s test table was built from real distance strings. Do not assume a format; look at the actual page.

## 3. Schema: results

Built parallel to `Result`/`Race`, not merged into them. `Result` already carries deep inline documentation about XC-specific semantics (division matching against `FieldResult`, overall placement logic); bolting track fields onto it would make both harder to read and reason about.

```prisma
model TrackMeet {
  id             String   @id @default(uuid()) @db.Uuid
  teamId         String   @map("team_id") @db.Uuid
  name           String
  date           DateTime @db.Date
  season         Int
  location       String?
  sourceUrl      String?  @map("source_url")
  athleticMeetId String?  @map("athletic_meet_id")

  results TrackResult[]

  @@index([teamId, season])
  @@map("track_meets")
}

model TrackResult {
  id            String     @id @default(uuid()) @db.Uuid
  teamId        String     @map("team_id") @db.Uuid
  trackMeetId   String     @map("track_meet_id") @db.Uuid
  eventId       String     @map("event_id") @db.Uuid
  athleteId     String?    @map("athlete_id") @db.Uuid   // null for a relay; see relayAthleteIds
  gender        String?
  grade         Int?
  round         String?    @default("FINAL")              // PRELIM | SEMI | FINAL
  markValue     Float?     @map("mark_value")              // seconds, meters, or total inches per Event.unit
  wind          Float?                                     // m/s, when the page reports it; sprints/jumps only
  place         Int?
  status        String     @default("FINISHED")            // FINISHED | DNF | DNS | DQ | NM (no mark)
  relayAthleteIds String[] @default([]) @map("relay_athlete_ids")

  team      Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  trackMeet TrackMeet @relation(fields: [trackMeetId], references: [id], onDelete: Cascade)
  event     Event     @relation(fields: [eventId], references: [id])

  @@index([teamId, eventId])
  @@index([athleteId])
  @@map("track_results")
}
```

Notes on the shape:

- `athleteId` is nullable; `relayAthleteIds` carries the roster for a relay leg. A relay result belongs to the team, not to one person. An athlete's individual journey (Section 6) pulls relay appearances from `relayAthleteIds`, not from `athleteId`.
- `markValue` is unitless on its own; always read it through `Event.unit`. Never compare two `markValue`s without checking they share a unit — comparing a 100m time to a discus throw's inches is the same category of bug as comparing feet to meters.
- `status` includes `NM` (no mark, a common field-event outcome when every attempt fouls), which is distinct from `DNF`. Exclude both from PR and average calculations identically.
- Multi-events are deliberately shallow in this pass. Store the final aggregate `markValue` (`MarkUnit.POINTS`) on one `TrackResult` row for the multi-event itself if Athletic.net reports it, but do not attempt to decompose it into its constituent sub-event marks or reimplement IAAF scoring tables. That is real complexity for a small fraction of entries at most WIAA meets, and reimplementing a scoring table wrong is a worse failure mode than not having it. Revisit after the booth if a coach specifically asks.

## 4. The scraper

Same discipline as the XC meet-page scraper: dump one real page to a fixture and inspect it before writing a single selector. Track results pages are structured completely differently from the XC season grid, event by event rather than one grid of times, and may have changed shape since any general knowledge of the site.

Order of work, same pattern as the XC meet scraper:

1. Explore the real team hub first. `athletic.net/team/460/track-and-field-outdoor/2026/` is a React-rendered page, confirmed by fetching `event-records` and getting back metadata only. Open it in a real browser (Playwright, not a plain fetch) and map its actual navigation — find the real results/schedule page, which `event-records` is probably not, before writing anything against it.
2. Dump that results page and at least one individual meet page to fixtures.
3. Write `scrape_track_season_playwright.js` against it, matching event names to the `Event` catalog by string (log and report anything that doesn't match rather than silently dropping it).
4. Write `scrape_track_meet_playwright.js` for the full-field meet page, following the same href-capture pattern already proven on the XC side: don't guess meet URLs, capture them from links already present on the season page.
5. Parse field-event marks through the Section 2 hazard's tested parser before anything else touches them.
6. Import Ellensburg's actual historical track data first, before building any analytics UI against it. That data is the whole point of the demo, and finding out the scraper has a gap is much cheaper before analytics are built on top of it than after.

Reuse the existing anti-bot handling, retry loop, and rate limiting (one request per two seconds minimum) from the XC scrapers rather than rewriting it.

## 5. Team-level analytics: the flagship

The one feature the booth needs to land, because it's the thing no other product in this space does and it directly answers the question every coach in that room actually has.

**Points-contribution view**

WIAA meets score team points by place within each event (commonly something like 10-8-6-5-4-3-2-1 for the top eight, though exact tables vary by meet level and should be confirmed rather than assumed). The view: for each event, how many team points did Ellensburg actually score this season versus prior seasons, and which events are we leaving points on the table in.

```
GET /api/track/analytics/points-contribution
  ?season=2026
  &gender=M|F
```

Returns, per event: this season's total scored points, a season-over-season trend, and the team's deepest versus thinnest events by athlete count scoring in them. This is a genuinely new kind of answer. A coach can see at a glance "we've scored zero points in throws for three years" in a way no spreadsheet or Athletic.net view currently shows them.

Do not build the exact scoring table into this as a hardcoded constant presented with confidence. Make it configurable per meet level, default to a clearly labeled assumption, and let a coach correct it. Scoring tables genuinely vary by meet (dual, league, district, state) and asserting one without it being checked is the same mistake as asserting a WIAA event list without checking it.

**PR progression (reuses the XC athlete journey)**

Per athlete, per event: PR history across seasons, with the mark and the meet where it was set. This is close to free, because the athlete-journey concept from the XC build already does the screenshot-at-phone-width, span-of-years version of this. Generalize it to take an `Event` instead of assuming pace.

**Depth by event group**

The XC band concept (top/middle/bottom by role) doesn't map directly, since track doesn't have one ranked field. The closer analogue: for each `EventCategory`, how many athletes scored a varsity-level mark this season versus three years ago. This is the track equivalent of "is the middle of our roster getting better," and it's the same instinct that made the XC band view worth building, applied to the dimension that actually exists in track.

**Cross-sport continuity**

When a coach has both an XC `Team` and a Track `Team`, match athletes by `athleticAthleteId` and surface "also ran XC" as a light cross-link on the track athlete page, pointing at their XC journey. Don't merge the underlying records. This is a strong, cheap differentiator worth having for the demo: an athlete's whole high school career, not just one sport's slice of it.

## 6. What the booth demo actually needs, in order

Sized to be real, standing software in March, not a mockup that gets rebuilt once track season starts. Nothing here is a stub.

1. Section 1 resolved against a real page.
2. Event catalog seeded and the field-event unit parser tested against real scraped strings.
3. Both scrapers built and Ellensburg's actual historical track results imported, several seasons back.
4. Points-contribution view, working against that real data.
5. PR progression per athlete, per event.
6. Team management (groups, practice plans, meet ops) confirmed working for a track team, which should need near-zero new code since none of it is sport-specific — this step is mostly verification, not building.
7. Depth-by-event-group view.
8. Cross-sport continuity link, if Jared's own coaching situation has both teams under one account by then.

Deferred past the booth, by design, not by running out of time: multi-event scoring decomposition, heat/prelim/semi/final UI beyond storing the round, indoor track if WIAA/the relevant league runs it, relay split times (rarely available via scrape), a configurable scoring-table editor beyond the single default.

## 7. Verify gate

1. The real results/schedule page in the track team hub is identified and fixture-dumped before the scraper is written against it.
2. The field-event unit parser has a test table built from real scraped strings and converts feet-inches to total inches correctly, including a value like `18-06.25`.
3. Ellensburg's actual historical track results are imported and visible in the app, spanning multiple seasons. This is the real gate, not a fixture-data stand-in.
4. The points-contribution view, run against that real data, produces a number a coach could sanity-check by hand for one event in one season.
5. A relay result does not require an `athleteId` and correctly attributes to all athletes in `relayAthleteIds` on their individual PR views.
6. Practice plans, groups, and meet ops work for a track team with zero additional code, confirming they were already scoped by `seasonId` rather than an assumed sport.
7. Setting the season picker to a Track season renders the Track-branch dashboard and Program view; setting it to an XC season renders the existing XC views; neither leaks into the other.
8. A `TeamMember` scoped to `sport: "TRACK"` can write track results and practice plans but gets 403 on every XC-season write, including results, training logs, and race reflections. A `sport: null` coach is unrestricted across both, matching every migrated pre-existing row.
9. `npm test` passes, including new tests for the mark parser, the points-contribution calculation, and sport-scoped staff authorization.

## What done looks like

Jared stands at a table in January with a laptop open to Ellensburg's own track history: a coach he's never met watches three years of their event-by-event scoring trend render from a season they actually coached, not a demo account. That's the whole pitch, and it only works if every piece between the scraper and that screen is real.
