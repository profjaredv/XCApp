# Migration Status: Supabase → Neon + Neon Auth

This documents what changed in the `neon-migration` branch, what's verified vs. not, and exactly what's left before this is deployable. Read this before touching the branch further — it's the honest state of things, not a changelog.

## Why this happened

The Supabase free project this app ran on was sunsetted. Rather than patch around that, this migration also fixes the critical access-control bugs and half-finished Mongo/Firebase migration cataloged in `XCAPP_ASSESSMENT.md` — doing both at once was the point, not scope creep.

## Rotate these immediately — real secrets were committed to this repo

Found while converting the code, independent of anything else:

1. **Google Gemini API key**, hardcoded in `backend/routes/coachesTools.js` (`AIzaSyCRFETAy65wsvX1YyLA2oRZQYSRu3P2Eso`). Revoke it in Google AI Studio / Cloud Console. The rewritten route no longer has a fallback literal — it requires `GEMINI_API_KEY` and disables the AI-insights feature (503) if unset.
2. **Supabase anon key + project URL**, hardcoded in `web/src/lib/supabase.ts` and `docs/history/RAILWAY_ENV_VARS.md`. Moot now that the Supabase project is gone, but the same "hardcode a fallback secret as the default" pattern shouldn't be repeated with the new Neon/Stack credentials.
3. **`COACH_UPGRADE_CODE=runnderland`**, committed in plaintext in `docs/history/RAILWAY_ENV_VARS.md`. This is a real authorization secret (anyone with it can self-promote to coach). Generate a new value and set it only as an env var — never in a file that gets committed.

## A privacy issue, not a security one

`data/460-2024.json` (real athlete names, grades, race times for what appears to be a real school's team — "Ellensburg") was sitting in the repo and has been removed from this branch. That kind of data — plausibly minors' names and performance records — shouldn't be in source control at all, regardless of how the security posture gets fixed. If you need sample/fixture data for testing, use synthetic names.

## What's done

- **Schema**: `backend/prisma/schema.prisma` — all 14 tables reconstructed from the app code and the old ad hoc SQL fix files (there was no single source of truth before; see file header comments for the specific cleanups made, e.g. `season` and `grade` are now `Int` everywhere instead of a mix of text/int).
- **DB layer**: `backend/lib/db.js` (Prisma client) replaces `backend/config/supabase.js` everywhere.
- **Auth**: `backend/middleware/auth.js` verifies Neon Auth (Stack) access tokens via JWKS instead of calling Supabase. `web/src/components/AuthProvider.tsx` and `web/src/lib/stackClientApp.ts` do the client side. **This is the one piece I could not verify against live documentation or a real Stack project in this session** — see "Unverified" below.
- **All 17 backend routes wired into `server.js`** converted from the Supabase query builder to Prisma: `profile`, `teams` (was `teamsSupabase.js`), `team` (was `teamSupabase.js`), `results`, `users`, `analytics`, `athletes`, `performanceRoutes`, `seasons`, `multiSeasonTrends`, `dataManagement`, `meets`, `splits`, `meetGroups`, `coachesTools`, `enhancedPerformanceRoutes`. `auth.js` was deleted outright — Neon Auth handles sign-up/sign-in client-side, so there's nothing left for it to do.
- **The access-control bugs from `XCAPP_ASSESSMENT.md` are fixed by construction, not patched**: no route accepts a client-supplied `teamId` for authorization anymore. Every team-scoped query derives `teamId` from `req.user.teamId` (set by `authenticate` from the verified token). Where a resource is looked up by its own id (a race, an athlete, a meet group), the query's `WHERE` clause includes `teamId` so a cross-team id 404s instead of leaking data. Concretely fixed: `dataManagement.js` clear/import, `meets.js` `GET /:id`, `enhancedPerformanceRoutes.js` athlete/progression routes — all of which had no team check at all before.
- **Performance calculation engine** (`services/performance/calculationServiceSupabase.js`, ~1000 lines) converted call-by-call — the math/business logic is untouched, only the ~15 database I/O call sites changed. Also fixed two latent bugs found while converting: field-name drift between what was written to `team_season_metrics` (`total_athletes`, etc.) and what the schema actually called those columns (`athlete_count`, per `SCHEMA_AUDIT.md`) — now consistent; and `calculateTeamDepth`/`calculatePackRunning` did one DB query per race in a loop — now one query per season, grouped in memory.
- **Dead code removed**: the entire Mongoose/Firebase stack (`backend/models/*.js`, `backend/config/firebase.js`, `services/performance/calculationService.js` and `enhancedCalculationService.js` — both fully orphaned, nothing required them), duplicate route files (`routes/teams.js`, `routes/team.js` — the pre-Supabase-suffix versions), the standalone one-off scripts at the repo root and in `backend/scripts/` (several hardcoded a real team's UUID and school name), `vercel.json` + `api/index.js` (dead Vercel/Mongo entry point), `Dockerfile` (Railway's `railway.toml` actually points at `nixpacks.toml`, not this), `firebase.json`/`firestore.indexes.json`, and the old `supabase/` + `supabase_migrations/` SQL folders (superseded by `backend/prisma/migrations`).
- **Frontend auth duplication removed**: `web/src/contexts/` had *six* files implementing/re-exporting auth context (`AuthContext.ts`, `AuthContext.tsx`, `AuthProvider.tsx`, `auth-context.tsx`, `auth-context-provider.tsx`, `auth-context-types.ts`) — two of them (`AuthContext.ts` and `AuthContext.tsx`) had the **same name with different extensions and different shapes**, which is a genuine build hazard (whichever one your bundler's resolver picks wins, silently). Down to two files: `contexts/AuthContext.ts` (the hook) and `components/AuthProvider.tsx` (the implementation).
- **~34 root-level "URGENT_FIX"-style markdown files** archived into `docs/history/` rather than deleted, so the history isn't lost but the root isn't cluttered.
- 42 root markdown docs, `/import` route (dead per the previous dev's own comment: `{/* Import Data archived - not shown in UI */}`), `CreateTeamForm.tsx`/`JoinTeamForm.tsx` (only referenced by already-archived `_archive/DashboardPage.tsx`) also removed.

## Unverified — check before you rely on it

**The Stack Auth / `@stackframe/react` frontend wiring** (`web/src/lib/stackClientApp.ts`, `web/src/components/AuthProvider.tsx`, and the `<SignIn/>`/`<SignUp/>` usage in `LoginPage.tsx`/`RegisterPage.tsx`). I could not get Stack Auth's docs to render their React-SPA-specific content through automated fetching in this session (the docs use platform-conditional sections that didn't resolve), and couldn't reach npm to check the package README either. This was written from Stack's documented patterns (confirmed via search: `useUser()` hook, `getAuthJson()` returning `{ accessToken, refreshToken }`, `<SignIn/>`/`<SignUp/>`/`<UserButton/>` components exist) but **not exercised against a real Stack project**.

**Before you trust this**, once you have a real Neon Auth project: run `npx @stackframe/stack-cli@latest init` inside `web/` — this is Stack's own scaffolding tool and will generate (or correct) `stackClientApp.ts` and the provider wiring against whatever the current SDK actually looks like. Treat anything it generates as more authoritative than my hand-written version.

**The backend JWT verification** (`middleware/auth.js`) is on firmer ground — JWKS verification is a standard, well-documented OIDC pattern and the code doesn't depend on Stack-specific SDK behavior, just the `sub`/`email` claims being present in the token, which is standard. Still worth a smoke test against a real token.

## Remaining work: frontend API service call sites

The following back-end routes had `:teamId` (and sometimes `:season`) removed from their URL — team is now derived from the authenticated session, never from the URL. The frontend service layer still calls the **old** URL shape and needs updating to match. This is mechanical (delete the `${teamId}/` segment from each template string) but has not been done:

| File | Old call (needs `${teamId}` removed) |
|---|---|
| `web/src/api/dataManagementService.ts` | `/data/clear/${teamId}/${season}` → `/data/clear/${season}`; `/performance/calculate/${teamId}/${season}` → `/performance/calculate/${season}`; `/performance/team/${teamId}/season/${season}` → `/performance/team/season/${season}`; `/enhanced-performance/calculate/${teamId}/${season}` → `/enhanced-performance/calculate/${season}` |
| `web/src/api/performanceService.ts` | `/performance/team/${teamId}/season/${season}` (×2, incl. `/series`) and `/performance/calculate/${teamId}/${season}` — same pattern |
| `web/src/api/enhancedAnalyticsService.ts` | `/enhanced-performance/team/${teamId}/${season}`, `/enhanced-performance/distance-analysis/${teamId}/${season}` |
| `web/src/components/settings/MeetGroupsManager.tsx` | all 6 `/meet-groups/${teamId}...` calls |
| `web/src/components/analytics/RaceComparisonTab.tsx` | `/enhanced-performance/multi-season-meets/${teamId}`, `/enhanced-performance/eligible-athletes/${teamId}`, `/enhanced-performance/meet-comparison/${teamId}/...`, `/enhanced-performance/meet-athlete/${teamId}/...` |
| `web/src/hooks/useMultiSeasonTrends.ts` | `/multi-season/team/${teamId}/trends` → `/multi-season/trends` |
| `web/src/pages/CoachesToolsPage.tsx` | all 3 `/coaches-tools/.../${teamId}/${currentSeason}` calls → drop `${teamId}/` |
| `web/src/pages/RaceVisualizationPage.tsx` | `/coaches-tools/improvement-tracking/${teamId}/${currentSeason}` |

Also removed entirely (no longer exist on the backend, frontend callers will 404 until updated or removed): `POST /api/data/import/:teamId/:season` and `POST /api/data/calculate/:teamId/:season` — both were dead/broken already (the import route required Mongoose, which was never connected in production; the calculate route was a hardcoded stub). The real import path is `POST /api/teams/scrape`; the real calculate path is `POST /api/performance/calculate/:season`.

`web/src/components/team/TeamSettings.tsx` calls `PUT /teams/${teamId}` — this route didn't exist in the pre-migration backend either (checked the original `teamsSupabase.js`), so this was already broken before the migration, not something introduced by it.

## Setup runbook

1. **Neon**: create a project at neon.tech. Enable **Neon Auth** (Project → Auth tab) — this gives you Postgres connection strings and a Stack project.
2. **Backend**: `cd backend && cp .env.example .env`, fill in `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `STACK_PROJECT_ID`, a fresh `COACH_UPGRADE_CODE`. Then `npm install && npx prisma migrate dev --name init`.
3. **Frontend**: `cd web && cp .env.example .env`, fill in `VITE_STACK_PROJECT_ID` and `VITE_STACK_PUBLISHABLE_CLIENT_KEY` from the same Neon Auth project. Run `npx @stackframe/stack-cli@latest init` here first (see "Unverified" above) before trusting the hand-written auth wiring.
4. Fix the frontend API call sites in the table above.
5. `npm run dev` from the repo root runs both.
6. Smoke test the golden path end to end: sign up → create a team → trigger a scrape → confirm analytics populate — before deploying.

## Not done in this pass (still applies from `XCAPP_ASSESSMENT.md`)

- No automated tests, no CI.
- The scraper is still synchronous/inline in the request (Phase 3 of the original assessment — job queue, retries, rate limiting — wasn't in scope for this DB/auth migration).
- Three duplicate scraper implementations still exist (`scrape_roster.py`, `scrape_season.py`, `scrape_season_playwright.js`) — only the Playwright one is wired in.
- `cache.js`'s `invalidateTeam(teamId)` (no season arg) will throw if `REDIS_URL` is unset, since it calls `this.redis.scanStream()` on a null client — pre-existing bug, not introduced here, not yet fixed.
