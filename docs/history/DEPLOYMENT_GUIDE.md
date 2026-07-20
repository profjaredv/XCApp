# LeadPack XC - Deployment Guide

## Current Status
✅ Code migrated to Supabase
✅ Database schema already set up in Supabase
✅ Build passes successfully
✅ All dependencies installed

## Architecture

**Frontend:** React + Vite (static files)
**Backend:** Node.js + Express API
**Database:** Supabase (PostgreSQL + Auth)

## Deployment Options

### Option 1: Railway (Recommended - Your Current Setup)

Railway can host both frontend and backend together.

#### Step 1: Update Railway Environment Variables

In your Railway dashboard, **replace** the old variables with these:

```bash
# Remove these old variables:
# - MONGODB_URI
# - FIREBASE_CREDENTIALS_JSON
# - All VITE_FIREBASE_* variables

# Add these new variables:
VITE_SUPABASE_URL=https://0ec90b57d6e95fcbda19832f.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw
COACH_UPGRADE_CODE=runnderland
PORT=3001
NODE_ENV=production
```

#### Step 2: Push to GitHub

```bash
git add .
git commit -m "Migrate to Supabase"
git push origin main
```

Railway will automatically detect the push and redeploy.

#### Step 3: Verify

Visit your Railway URL and test:
1. Register a new user
2. Login
3. Create a team

---

### Option 2: Vercel (Alternative)

Better for static sites but requires separate backend hosting.

#### Frontend (Vercel)

1. Go to vercel.com
2. Import your GitHub repo
3. Set environment variables:
   ```
   VITE_SUPABASE_URL=https://0ec90b57d6e95fcbda19832f.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   VITE_API_BASE_URL=https://your-backend-url.com/api
   ```
4. Deploy

#### Backend (Railway or Render)

1. Create new service for backend
2. Point to your repo
3. Set root directory to `/backend`
4. Add environment variables (same as Option 1)

---

## Local Development

To run locally:

```bash
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Frontend
cd web
npm install
npm run dev
```

Visit http://localhost:5173

---

## Environment Variables Explained

### Frontend (VITE_*)
- **VITE_SUPABASE_URL**: Your Supabase project URL
- **VITE_SUPABASE_ANON_KEY**: Public anonymous key (safe to expose)
- **VITE_API_BASE_URL**: Backend API URL (optional, defaults to /api)

### Backend
- **PORT**: Port for Express server (Railway auto-assigns)
- **NODE_ENV**: Set to "production" in production
- **COACH_UPGRADE_CODE**: Secret code to upgrade users to coach role
- Supabase credentials are inherited from .env or VITE_ variables

---

## What Changed from Original Setup

### Before (MongoDB + Firebase)
- MongoDB for data storage
- Firebase for authentication
- Required MONGODB_URI and Firebase credentials
- Separate auth and database services

### After (Supabase)
- Supabase for everything (database + auth)
- Single service, simpler setup
- Only need Supabase URL and keys
- Built-in Row Level Security

---

## Testing Checklist

After deployment, test these features:

- [ ] User registration
- [ ] User login
- [ ] Create team (need coach role first)
- [ ] Join team with code
- [ ] Import data from Athletic.net
- [ ] View athletes
- [ ] View results
- [ ] View analytics

---

## Troubleshooting

### "Authentication service unavailable"
- Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
- Verify Supabase project is active

### "Cannot connect to database"
- Supabase connection is automatic, no separate DATABASE_URL needed
- Check your Supabase project status

### Build fails
- Make sure all VITE_ variables are set BEFORE build
- Run `npm run build` locally to test

### API calls fail
- Check backend is running
- Verify CORS settings in backend/server.js
- Check API URL in frontend

---

## Need Help?

1. Check Supabase dashboard for database status
2. Check Railway/Vercel logs for errors
3. Test locally first to isolate issues
4. Verify all environment variables are set correctly
