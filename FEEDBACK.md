# Feedback log

A place to dump observations while walking the app. Work **one flow at a time**,
note everything you hit, then hand over the whole batch. Ten issues from one
flow usually share two or three root causes — that pattern is visible in a
batch and invisible one bug at a time.

Don't pre-filter or pre-diagnose. Raw observations are more useful than a
theory, and "this felt clunky" is legitimate feedback, not just crashes.

## What to capture

In rough order of how much it helps:

1. **Expected vs. actual.** "Roster shows 2026, should be 2025" beats "roster
   looks wrong."
2. **Browser console.** The error text *and* the failing request — DevTools →
   Network → click the red entry → Response tab.
3. **Railway deploy logs.** Server-side truth. Some failures (a missing env
   var, a Prisma error) are completely invisible from the browser.
4. **Screenshot.** Best for layout and UX, weakest for logic bugs.

## Format

Copy this per observation. Severity: `blocker` (can't proceed) / `bug` (wrong
but workable) / `polish` (works, feels wrong).

```
### [flow] short title
severity:
expected:
actual:
console/logs:
```

---

# Flow 1 — Set up a team

Create the team, connect Athletic.net, build a roster before any race exists.

- [ ] Team settings save without error (this endpoint didn't exist until recently)
- [ ] Roster tab loads
- [ ] Add an athlete by hand; they appear under the right grade
- [ ] Grades read as class years (a freshman stays class-of-X across seasons)
- [ ] Setup checklist appears for a team with no results, and steps tick off

_Observations:_

# Flow 2 — Get data in

Import a season from Athletic.net.

- [ ] Import runs without a 500
- [ ] Scraper actually returns results (still unverified — if it fails, the logs
      now print the final URL, page title and a body snippet: that's the useful part)
- [ ] Imported athletes land on the roster with correct grades
- [ ] Re-importing the same season doesn't duplicate races or results

_Observations:_

# Flow 3 — Read the season

Team dashboard, meets, results grid.

- [ ] Analytics defaults to the season with data (not an empty calendar year)
- [ ] Season switcher lists real seasons and switching actually changes the data
- [ ] Meet list and results grid match what's on Athletic.net
- [ ] Numbers are believable — pace, mileage, PRs

_Observations:_

# Flow 4 — Read an athlete

Profile, PRs, progression across seasons.

- [ ] Athlete profile opens and shows this season's races
- [ ] Career history spans multiple seasons (this was silently empty before)
- [ ] PRs and season bests are correct
- [ ] A graduated athlete is still viewable in past seasons and trends

_Observations:_

# Flow 5 — Coach with it

Training groups, improvement tracking, AI insights.

- [ ] Coaches Tools loads for the active season
- [ ] Training group suggestions are sensible
- [ ] Improvement tracking picks the right comparison races
- [ ] AI insights work, or fail clearly when no key is set

_Observations:_

# Flow 6 — Roll over to next season

- [ ] "Start <year>" carries returning athletes forward, one grade up
- [ ] Seniors drop off the active roster
- [ ] Graduated athletes still appear in history and multi-season trends
- [ ] Athletes with no class year are flagged for review rather than guessed at
- [ ] A started-but-unraced season reads as preseason, not as an error

_Observations:_

---

# Known open

Things already identified, so they don't need re-reporting:

- **Scraper vs. athletic.net** — hardened against bot-blocking (browser
  identity, retries, failure diagnostics) but not yet confirmed working.
- **Season/roster rework is unverified against live data** — the database
  wasn't reachable from the dev sandbox, so flows 1–6 need a real run.
- **Backend boots "healthy" with a missing `DATABASE_URL`** and only fails on
  the first request. Should fail fast at startup instead.
- **Single ~2 MB JS bundle, no code splitting** — one bad module takes down the
  whole app (this is what caused the white screen).
- **`_archive/` still has type errors.** Excluded from the working set; delete
  or fix eventually.
