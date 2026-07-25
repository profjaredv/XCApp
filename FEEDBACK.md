# Feedback log

> **There is now an in-app feedback button** (bottom-right, every screen). It
> attaches the screen, the season you're viewing and any recent console errors
> automatically. Prefer it over this file — then open **Feedback** in the
> sidebar and hit "Copy as markdown" to hand the whole batch over at once.
>
> This file stays useful for notes taken away from the app.

Dump observations here as you click through the app. Organised by screen —
that's how you'll actually encounter problems.

Work through **one screen at a time** and note everything you see, then hand
over that section. A full screen's worth of observations is more useful than
one bug at a time: issues on the same screen often share a root cause, and
that's visible in a batch.

Don't pre-filter or pre-diagnose. Raw observations beat theories, and "this
feels clunky" is legitimate feedback, not just crashes.

## What to capture

In rough order of how much it helps:

1. **Expected vs. actual.** "Roster shows 2026, should be 2025" beats "roster
   looks wrong."
2. **Browser console.** The error text *and* the failing request — DevTools →
   Network → click the red entry → Response tab.
3. **Railway deploy logs.** Server-side truth. Some failures (a missing env
   var, a Prisma error) are invisible from the browser.
4. **Screenshot.** Best for layout and UX, weakest for logic bugs.

## Format

Copy this per observation. Severity: `blocker` (can't proceed) / `bug` (wrong
but workable) / `polish` (works, feels wrong).

```
### short title
severity:
expected:
actual:
console/logs:
```

Anything about how it *looks* or *feels* — spacing, wording, hierarchy, "why is
this even here" — is worth writing down. Tag it `polish` and keep moving.

---

# Public

## Landing page `/`

_Observations:_

## Sign in `/login` · Sign up `/register`

_Observations:_

## Onboarding `/onboarding`

First screen after signing up.

_Observations:_

---

# Main app

## Analytics `/analytics`

The default screen after login. Note the season shown in the header — it should
be a season you have data for, not an empty year.

Per tab:

- **Dashboard** —
- **Athletes** —
- **Meets** —
- **Performance** —
- **Distance Analysis** —
- **Head-to-Head** —

_Observations:_

## Roster `/roster`

New screen. Add athletes by hand, grouped by grade, "Start &lt;year&gt;" rollover.

_Observations:_

## My Team `/team`

The older roster/invites screen. Worth noting where it overlaps or conflicts
with the new Roster screen — that overlap is a design question, not just a bug.

_Observations:_

## Results Grid `/results-grid`

_Observations:_

## Tools `/tools`

_Observations:_

## Coaches Tools `/coaches-tools`

Training groups, improvement tracking, AI insights.

_Observations:_

## Data Management `/data-management`

Import a season, recalculate metrics, clear data.

_Observations:_

## Athlete profile `/athlete/:id`

Reached by clicking an athlete. PRs, season and career progression.

_Observations:_

## Race visualization `/race-visualization`

_Observations:_

## Settings `/settings`

Team name, Athletic.net ID, current season, danger zone.

_Observations:_

## Profile `/profile`

_Observations:_

---

# Cross-cutting

Things that aren't one screen: navigation, mobile layout, loading states, error
messages, wording and terminology, anything that behaves differently in one
place than another.

_Observations:_

---

# Known open

Already identified — no need to re-report:

- **Scraper vs. athletic.net** — hardened against bot-blocking (browser
  identity, retries, failure diagnostics) but not yet confirmed working. If it
  fails, the logs now print the final URL, page title and a body snippet;
  that's the part worth pasting.
- **Season/roster rework is unverified against live data** — the database
  wasn't reachable from the dev sandbox, so all of it needs a real run.
- **Backend boots "healthy" with a missing `DATABASE_URL`** and only fails on
  the first request. Should fail fast at startup.
- **Single ~2 MB JS bundle, no code splitting** — one bad module takes down the
  whole app (this caused the white screen).
- **`_archive/` still has type errors.** Excluded from the working set; delete
  or fix eventually.
