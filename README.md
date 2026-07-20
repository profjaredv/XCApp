# LeadPack XC

A cross country team management and performance analytics platform: import race results from Athletic.net, then track team and individual performance across meets and seasons.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + Prisma
- **Database**: Neon (serverless Postgres)
- **Auth**: Neon Auth (Stack Auth) — the frontend handles sign-in/sign-up directly against Stack; the backend only verifies the resulting access token
- **Scraper**: Playwright, invoked from the backend against Athletic.net's public results pages
- **Deployment**: Railway (the Playwright/Chromium dependency isn't viable on Vercel-style serverless — see `nixpacks.toml`)

This is a from-scratch migration off Supabase (sunsetted) and a half-finished Mongo/Firebase-era codebase. See `MIGRATION_STATUS.md` for what changed, what's still unverified, and the setup steps below in more detail. See `XCAPP_ASSESSMENT.md` for the original security/architecture audit that this migration addresses.

## Project Structure

```
.
├── web/                 # React frontend
├── backend/              # Express API server + Prisma schema/migrations
└── docs/history/         # Archived design/debug notes from earlier iterations
```

## Local Development

1. **Create a Neon project** (neon.tech) and enable **Neon Auth** on it (Project → Auth tab). This gives you:
   - A pooled and a direct Postgres connection string
   - A Stack project ID and publishable client key

2. **Backend setup**:
   ```bash
   cd backend
   cp .env.example .env   # fill in DATABASE_URL, DIRECT_URL, STACK_PROJECT_ID, COACH_UPGRADE_CODE
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```

3. **Frontend setup**:
   ```bash
   cd web
   cp .env.example .env   # fill in VITE_STACK_PROJECT_ID, VITE_STACK_PUBLISHABLE_CLIENT_KEY
   npm install
   npm run dev
   ```

## Deployment (Railway)

1. Set the backend service's environment variables from `backend/.env.example` (real values) in the Railway dashboard.
2. Set the frontend build's `VITE_*` variables — these are baked in at build time, so set them before deploying.
3. Railway builds via `nixpacks.toml`, which installs the Chromium dependencies the scraper needs and runs `npx playwright install chromium --with-deps`.
4. Run `npx prisma migrate deploy` (from `backend/`) against the production `DIRECT_URL` before the first deploy, and after any schema change.

## Analytics Features

- **Team overview**: race counts, mileage, pace trends, season improvement
- **Athletes**: individual profiles, PR tracking, grade/gender filtering, career progression across seasons
- **Meets**: race-by-race results and visualizations, manual meet grouping for cross-season comparison
- **Coaches tools**: rule-based training group suggestions, improvement tracking, optional AI-generated insights (requires `GEMINI_API_KEY`)

## Data Flow

1. **Import**: a coach triggers a scrape of their team's Athletic.net results page (Playwright)
2. **Store**: results are upserted into Postgres (athletes, races, results)
3. **Calculate**: `calculationServiceSupabase.calculateAllMetrics` runs in the background, computing per-athlete, per-meet, and per-team season metrics
4. **Display**: the frontend reads the pre-calculated metrics tables — fast, no live aggregation on every page load

## Security

- Neon Auth (Stack) handles authentication; the backend verifies access tokens cryptographically against Stack's JWKS
- Every team-scoped query is scoped by the authenticated user's own `teamId` — no route trusts a client-supplied team id for authorization (see `XCAPP_ASSESSMENT.md` for the access-control bugs this replaces)
- No secrets are committed to this repo — see `MIGRATION_STATUS.md` for keys that need rotating from the pre-migration codebase

## License

MIT License - see LICENSE file for details
