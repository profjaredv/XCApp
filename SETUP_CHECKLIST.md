# Setup Checklist to Get App Working

## Critical Backend Fixes Applied ✓
- [x] Fixed `req.user.uid` → `req.user.id` in all routes
- [x] Updated `/api/users/me` to use Supabase
- [x] Fixed team creation route in teamsSupabase.js
- [x] Fixed profile routes to use correct user ID

## Critical Frontend Fixes Applied ✓
- [x] Fixed AuthProvider to map `id` → `uid` for User type
- [x] Fixed ProtectedRoute to use Supabase instead of Firebase
- [x] Fixed axios interceptor token handling
- [x] Fixed LoginPage to redirect to onboarding if no team

## What Needs to Happen Next

### 1. Deploy Backend Changes to Railway
The backend code has been fixed but Railway is still running the old code. You need to:

1. **Push code to git**: `git add . && git commit -m "Fix auth and user routes" && git push`
2. **Railway will auto-deploy** (if connected to git)
   - OR manually trigger a deploy in Railway dashboard

### 2. Verify Railway Environment Variables
Check these are set in Railway dashboard:

**Required Variables:**
```
VITE_SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjc5MDAsImV4cCI6MjA3NDg0MzkwMH0.EPqTphL-6N1kzNaAj6QnKnXGc4W2qEHbXNvv6cZ73Aw
SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNjc5MDAsImV4cCI6MjA3NDg0MzkwMH0.EPqTphL-6N1kzNaAj6QnKnXGc4W2qEHbXNvv6cZ73Aw
PORT=3000
NODE_ENV=production
COACH_UPGRADE_CODE=runnderland
```

**Remove these if they exist:**
- Any variables with old Supabase URL (0ec90b57d6e95fcbda19832f.supabase.co)
- FIREBASE_* variables
- MONGODB_URI

### 3. Test Locally First
Before deploying, test the complete flow locally:

```bash
# Terminal 1: Start backend
cd backend && npm start

# Terminal 2: Start frontend
cd web && npm run dev
```

Test this flow:
1. Register new user at http://localhost:5173/register
2. Should auto-redirect to /onboarding
3. Create team with name + Athletic.net ID
4. Should auto-upgrade to coach and redirect to /analytics
5. Navigate to /import to import data

### 4. What the Complete Flow Should Do

**Registration → Onboarding → Team Creation:**
1. User registers → Supabase creates auth account
2. User redirected to /onboarding
3. User creates team → Backend:
   - Creates team record
   - Updates user role to 'coach'
   - Creates team_member record
   - Returns updated user
4. Frontend receives updated user → redirects to /analytics

**Login:**
1. User logs in → Supabase authenticates
2. AuthProvider calls `/api/users/me`
3. Auth middleware:
   - Validates token with Supabase
   - Fetches user from database
   - If user doesn't exist, creates it automatically
   - Returns user with team data
4. If user has team → /analytics
5. If no team → /onboarding

## Common Issues and Solutions

### "Blank screen after refresh"
**Cause**: Session expired or invalid
**Solution**:
- Clear browser local storage
- Log out and log back in
- Check browser console for errors

### "403 Forbidden errors"
**Cause**: Backend using old code with `req.user.uid`
**Solution**: Deploy updated backend code

### "User has no team after creating one"
**Cause**: Frontend not refreshing user data
**Solution**: After team creation, the backend returns updated user - frontend should use that

### "Can't import data"
**Cause**: User not recognized as coach
**Solution**: Check that user.role === 'coach' in browser dev tools

## Files Modified in This Fix

**Backend:**
- `/backend/routes/teamsSupabase.js` - Fixed req.user.uid → req.user.id
- `/backend/routes/profile.js` - Fixed req.user.uid → req.user.id
- `/backend/routes/team.js` - Fixed req.user.uid → req.user.id
- `/backend/routes/users.js` - Converted from Mongoose to Supabase
- `/backend/middleware/auth.js` - Already correct (uses req.user.id)

**Frontend:**
- `/web/src/components/AuthProvider.tsx` - Maps backend id → frontend uid
- `/web/src/router/ProtectedRoute.tsx` - Uses Supabase instead of Firebase
- `/web/src/pages/LoginPage.tsx` - Smart redirect based on team status
- `/web/src/pages/OnboardingPage.tsx` - Simplified session handling
- `/web/src/api/axios.ts` - Fixed token refresh logic
