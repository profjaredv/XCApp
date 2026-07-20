# Railway Environment Variables Required

## Supabase Variables (REQUIRED)
These must be set in Railway dashboard for both frontend build and backend:

```
VITE_SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjc5MDAsImV4cCI6MjA3NDg0MzkwMH0.EPqTphL-6N1kzNaAj6QnKnXGc4W2qEHbXNvv6cZ73Aw
SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjc5MDAsImV4cCI6MjA3NDg0MzkwMH0.EPqTphL-6N1kzNaAj6QnKnXGc4W2qEHbXNvv6cZ73Aw
```

## Backend Variables
```
PORT=3000
NODE_ENV=production
RAILWAY_ENVIRONMENT=production
COACH_UPGRADE_CODE=runnderland
```

## How to Set in Railway:
1. Go to your Railway project: https://railway.app/project/[your-project-id]
2. Click on your service
3. Go to "Variables" tab
4. Click "New Variable" for each one above
5. **IMPORTANT:** After adding all variables, click "Deploy" to rebuild with the env vars

**Critical:** The VITE_ variables are baked into the frontend build at BUILD TIME, so you must set them BEFORE deploying.

## Removing Old Variables
Make sure to REMOVE or UPDATE these old variables if they exist:
- Any variables with the old Supabase URL (0ec90b57d6e95fcbda19832f.supabase.co)
- FIREBASE_* variables (no longer used)
- MONGODB_URI (no longer used)
