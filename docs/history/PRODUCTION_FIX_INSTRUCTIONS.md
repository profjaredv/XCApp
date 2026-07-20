# Fix Production Team Creation Error

## The Problem

Users are getting a **500 error** when trying to create a team in production because:

1. The Supabase RLS (Row Level Security) policy on the `teams` table only allows users with `role='coach'` to INSERT
2. But new users have `role='athlete'` by default
3. They can't create a team without being a coach, but they can't become a coach without creating a team
4. This is a **chicken-and-egg problem**

## The Solution

Update the RLS policy to allow **any authenticated user** to create a team. The application logic will automatically upgrade them to coach role after successful team creation.

## Steps to Fix

### Option 1: Run SQL in Supabase Dashboard (Fastest)

1. **Open Supabase SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/nxlatotemxoryjsuouak/sql/new

2. **Copy and paste this SQL:**
   ```sql
   -- Drop the restrictive policy
   DROP POLICY IF EXISTS "Coaches can create teams" ON teams;

   -- Allow any authenticated user to create a team
   CREATE POLICY "Authenticated users can create teams"
     ON teams FOR INSERT
     TO authenticated
     WITH CHECK (true);
   ```

3. **Click "Run"**

4. **Test:** Try creating a team again in your app

### Option 2: Use the Migration File

The fix is also available as a migration file:
- File: `/supabase/migrations/20251002_allow_team_creation.sql`
- Or: `/FIX_TEAM_CREATION.sql` (shorter version)

You can apply it however you normally apply migrations in your workflow.

## How It Works After the Fix

1. User registers with `role='athlete'`
2. User navigates to onboarding page
3. User creates a team ✅ (now allowed by RLS)
4. Backend creates the team
5. Backend updates user to `role='coach'`
6. Backend adds user to `team_members` table
7. User is redirected to analytics

## Verification

After running the SQL, verify it worked:

```sql
-- Check the policy exists
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'teams'
  AND policyname = 'Authenticated users can create teams';
```

You should see:
- **policyname**: "Authenticated users can create teams"
- **cmd**: INSERT
- **roles**: {authenticated}

## Other Potential Issues

If you still get 500 errors after applying this fix, check:

1. **Environment Variables in Railway:**
   - Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly
   - Should be: `https://nxlatotemxoryjsuouak.supabase.co`

2. **Backend Logs in Railway:**
   - Check for specific error messages
   - Look for database connection errors

3. **Check if user can be updated:**
   - The `users` table also needs correct RLS policies
   - User should be able to update their own profile

## Related Files

- `/supabase/migrations/20251002_allow_team_creation.sql` - Migration file
- `/FIX_TEAM_CREATION.sql` - Quick SQL script
- `/backend/routes/teamsSupabase.js` - Team creation endpoint

## Why This Happened

The original RLS policies were designed for a system where coaches were invited/appointed by admins. In your app, users self-promote to coach by creating a team, which requires a different security model.

The fix maintains security while allowing the self-service team creation flow to work.
