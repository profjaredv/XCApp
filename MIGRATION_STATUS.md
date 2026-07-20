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
- **Auth**: `backend/middleware/auth.js` verifies Neon Auth JWTs via JWKS instead of calling Supabase. `web/src/lib/auth.ts` and `web/src/components/AuthProvider.tsx` do the client side, using `@neondatabase/neon-js` (Neon Auth is Better Auth under the hood, not Stack Auth — confirmed against the project's own Auth tab and the real npm package contents, see below).
- **All 17 backend routes wired into `server.js`** converted from the Supabase query builder to Prisma: `profile`, `teams` (was `teamsSupabase.js`), `team` (was `teamSupabase.js`), `results`, `users`, `analytics`, `athletes`, `performanceRoutes`, `seasons`, `multiSeasonTrends`, `dataManagement`, `meets`, `splits`, `meetGroups`, `coachesTools`, `enhancedPerformanceRoutes`. `auth.js` was deleted outright — Neon Auth handles sign-up/sign-in client-side, so there's nothing left for it to do.
- **The access-control bugs from `XCAPP_ASSESSMENT.md` are fixed by construction, not patched**: no route accepts a client-supplied `teamId` for authorization anymore. Every team-scoped query derives `teamId` from `req.user.teamId` (set by `authenticate` from the verified token). Where a resource is looked up by its own id (a race, an athlete, a meet group), the query's `WHERE` clause includes `teamId` so a cross-team id 404s instead of leaking data. Concretely fixed: `dataManagement.js` clear/import, `meets.js` `GET /:id`, `enhancedPerformanceRoutes.js` athlete/progression routes — all of which had no team check at all before.
- **Performance calculation engine** (`services/performance/calculationServiceSupabase.js`, ~1000 lines) converted call-by-call — the math/business logic is untouched, only the ~15 database I/O call sites changed. Also fixed two latent bugs found while converting: field-name drift between what was written to `team_season_metrics` (`total_athletes`, etc.) and what the schema actually called those columns (`athlete_count`, per `SCHEMA_AUDIT.md`) — now consistent; and `calculateTeamDepth`/`calculatePackRunning` did one DB query per race in a loop — now one query per season, grouped in memory.
- **Dead code removed**: the entire Mongoose/Firebase stack (`backend/models/*.js`, `backend/config/firebase.js`, `services/performance/calculationService.js` and `enhancedCalculationService.js` — both fully orphaned, nothing required them), duplicate route files (`routes/teams.js`, `routes/team.js` — the pre-Supabase-suffix versions), the standalone one-off scripts at the repo root and in `backend/scripts/` (several hardcoded a real team's UUID and school name), `vercel.json` + `api/index.js` (dead Vercel/Mongo entry point), `Dockerfile` (Railway's `railway.toml` actually points at `nixpacks.toml`, not this), `firebase.json`/`firestore.indexes.json`, and the old `supabase/` + `supabase_migrations/` SQL folders (superseded by `backend/prisma/migrations`).
- **Frontend auth duplication removed**: `web/src/contexts/` had *six* files implementing/re-exporting auth context (`AuthContext.ts`, `AuthContext.tsx`, `AuthProvider.tsx`, `auth-context.tsx`, `auth-context-provider.tsx`, `auth-context-types.ts`) — two of them (`AuthContext.ts` and `AuthContext.tsx`) had the **same name with different extensions and different shapes**, which is a genuine build hazard (whichever one your bundler's resolver picks wins, silently). Down to two files: `contexts/AuthContext.ts` (the hook) and `components/AuthProvider.tsx` (the implementation).
- **~34 root-level "URGENT_FIX"-style markdown files** archived into `docs/history/` rather than deleted, so the history isn't lost but the root isn't cluttered.
- 42 root markdown docs, `/import` route (dead per the previous dev's own comment: `{/* Import Data archived - not shown in UI */}`), `CreateTeamForm.tsx`/`JoinTeamForm.tsx` (only referenced by already-archived `_archive/DashboardPage.tsx`) also removed.

## Auth frontend — verified against the real package, not guessed

An earlier pass of this migration wrote the frontend auth wiring against `@stackframe/react` (Stack Auth), based on a training-data assumption that "Neon Auth" meant Stack Auth. It doesn't — the project's own Auth tab says "Powered by Better Auth", and Neon's actual client SDK is `@neondatabase/neon-js`, a wrapper around `@neondatabase/auth` (Better Auth). That version has been replaced.

This time, the API surface was confirmed by downloading the real packages (`@neondatabase/neon-js@0.6.2-beta`, `@neondatabase/auth@0.4.2-beta`, `@neondatabase/auth-ui@0.2.1-beta`, `@daveyplate/better-auth-ui@3.3.9`) via `npm pack` and reading their shipped `.d.mts` type definitions and runtime source directly — not from training-data recall. Concretely:

- `createInternalNeonAuth(url, { adapter: BetterAuthReactAdapter() })` (from `@neondatabase/neon-js/auth` + `@neondatabase/neon-js/auth/react/adapters`) returns `{ adapter, getJWTToken }` — `adapter` is the flattened Better Auth React client (`useSession()`, `signIn.email()`, `signUp.email()`, `signOut()`), `getJWTToken()` is Neon Auth's own addition for getting a bearer token to call our own backend. (`createAuthClient()`, used by the docs' quickstart, returns only the flattened `adapter` — no `getJWTToken` — which is why `web/src/lib/auth.ts` uses `createInternalNeonAuth` instead.)
- `NeonAuthUIProvider`'s `authClient` prop wants that flattened adapter (not the `{adapter, getJWTToken}` wrapper), plus `navigate`/`replace`/`Link` props for router integration — wired to the `RouterProvider`'s router instance's imperative `.navigate()` method in `main.tsx`, since `useNavigate()` isn't callable above the router in the tree.
- `<AuthView pathname="sign-in" />` / `<AuthView pathname="sign-up" />` are the real prop names (confirmed via `AuthViewProps` in `@daveyplate/better-auth-ui`'s shipped types).

This is now on the same footing as the rest of the backend JWT verification below — read from the real thing, not assumed. Still worth a live smoke test (sign up → sign in → confirm `/users/me` returns data) before you fully trust it, same as anything else in a fresh migration.

**The backend JWT verification** (`middleware/auth.js`) was already on firmer ground — JWKS verification is a standard, well-documented OIDC pattern and the code doesn't depend on any auth-vendor-specific SDK behavior, just the `sub`/`email` claims being present in the token, which is standard. Still worth a smoke test against a real token — Better Auth's JWT plugin claim shape hasn't been checked line-for-line against what's read here.

## Frontend API service call sites — done

The following back-end routes had `:teamId` (and sometimes `:season`) removed from their URL — team is now derived from the authenticated session, never from the URL. All frontend call sites were updated to match (each still accepts a `teamId` parameter where it was part of a function's public signature, for call-site compatibility, but no longer puts it in the URL — marked `void teamId` where it would otherwise be an unused-parameter build error under this project's `noUnusedParameters: true`):

- `web/src/api/dataManagementService.ts` — `clearData`, `calculateMetrics`, `calculateEnhancedMetrics`
- `web/src/api/performanceService.ts` — `getTeamMetrics`, `getMeetMetrics`, `getTeamSeasonSeries`, `recalculateMetrics`
- `web/src/api/enhancedAnalyticsService.ts` — `getEnhancedTeamMetrics`, `getDistanceAnalysis`
- `web/src/components/settings/MeetGroupsManager.tsx` — all 6 `/meet-groups/...` calls
- `web/src/components/analytics/RaceComparisonTab.tsx` — all 4 `/enhanced-performance/...` calls
- `web/src/hooks/useMultiSeasonTrends.ts`
- `web/src/pages/CoachesToolsPage.tsx` — all 3 calls
- `web/src/pages/RaceVisualizationPage.tsx`

Not touched, and not part of this fix — pre-existing dead/broken calls that 404'd before this migration too, not something it introduced:
- `enhancedAnalyticsService.getRaceComparisons` calls `/enhanced-performance/race-comparisons/:athleteId`, a route that never existed on the backend (checked the pre-migration `enhancedPerformanceRoutes.js`).
- `performanceService.clearCache` posts a `{ scope, teamId, athleteId, season }` body that doesn't match what `/performance/cache/clear` now reads (just `{ season }`, scoped to the caller's own team) — but this function isn't called from anywhere in the app (`useInvalidatePerformanceCache.ts` only does client-side React Query cache invalidation, never calls this endpoint), so it's unused code, not a live bug.

Also removed entirely (no longer exist on the backend, frontend callers will 404 until updated or removed): `POST /api/data/import/:teamId/:season` and `POST /api/data/calculate/:teamId/:season` — both were dead/broken already (the import route required Mongoose, which was never connected in production; the calculate route was a hardcoded stub). The real import path is `POST /api/teams/scrape`; the real calculate path is `POST /api/performance/calculate/:season`.

`web/src/components/team/TeamSettings.tsx` calls `PUT /teams/${teamId}` — this route didn't exist in the pre-migration backend either (checked the original `teamsSupabase.js`), so this was already broken before the migration, not something introduced by it.

## The schema is already live on the real Neon database

The Claude Code sandbox this migration was written in cannot make raw TCP connections to any database — its egress proxy explicitly blocks that (HTTPS only), so `prisma migrate dev`/`deploy` can't run from there. Rather than leave the schema unverified, once you shared the connection string I applied it a different way: generated the migration SQL with `prisma migrate diff --from-empty` (schema-only, no DB connection needed), then executed each statement over Neon's HTTPS SQL endpoint (`@neondatabase/serverless`'s `neon()` query function — real HTTPS, not a workaround). Confirmed all 14 tables, indexes, and foreign keys exist on your actual database by querying `information_schema.tables` afterward.

The migration is committed at `backend/prisma/migrations/20260720175808_init/migration.sql` so it's tracked like any normal Prisma migration. Prisma's own bookkeeping table (`_prisma_migrations`) doesn't know about it yet, though, since that write happens through Prisma's normal TCP path, which I don't have. **One command, run locally where you have real network access, closes that gap:**

```bash
cd backend
npx prisma migrate resolve --applied 20260720175808_init
```

This is Prisma's standard, documented way to tell it "this migration is already applied, just record it" — safe, well-worn, and avoids me hand-computing a checksum and risking a subtle mismatch. After that, `prisma migrate dev`/`deploy` will behave normally for any future schema changes.

## Setup runbook

1. **Neon**: done — you have a project and a `DATABASE_URL`/`DIRECT_URL`. Enable **Neon Auth** (Project → Auth tab) if you haven't, to get an Auth URL and a JWKS URL. Skip the **Data API** toggle — unrelated feature, would expose the database directly over HTTP with none of this app's authorization logic in front of it.
2. **Backend**: `cd backend`, fill in `.env` with `NEON_AUTH_JWKS_URL` and a fresh `COACH_UPGRADE_CODE` (already has `DATABASE_URL`/`DIRECT_URL`). Run `npx prisma migrate resolve --applied 20260720175808_init` (see above).
3. **Frontend**: `cd web && cp .env.example .env`, fill in `VITE_NEON_AUTH_URL` (the "Auth URL" from the same Neon Auth project — a full URL like `https://<endpoint>.neonauth.<region>.aws.neon.tech/<database>/auth`, not the JWKS one).
4. `npm run dev` from the repo root runs both.
5. Smoke test the golden path end to end: sign up → create a team → trigger a scrape → confirm analytics populate — before deploying.

## Not done in this pass (still applies from `XCAPP_ASSESSMENT.md`)

- No automated tests, no CI.
- The scraper is still synchronous/inline in the request (Phase 3 of the original assessment — job queue, retries, rate limiting — wasn't in scope for this DB/auth migration).
- Three duplicate scraper implementations still exist (`scrape_roster.py`, `scrape_season.py`, `scrape_season_playwright.js`) — only the Playwright one is wired in.
- `cache.js`'s `invalidateTeam(teamId)` (no season arg) will throw if `REDIS_URL` is unset, since it calls `this.redis.scanStream()` on a null client — pre-existing bug, not introduced here, not yet fixed.
