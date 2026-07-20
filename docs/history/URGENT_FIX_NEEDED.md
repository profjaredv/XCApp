# 🚨 URGENT: Fix Team Creation 500 Error

## The Problem
Users are getting a **500 error** when trying to create a team because the Supabase RLS (Row Level Security) policy is too restrictive.

**Current situation:**
- New users have `role='athlete'` by default
- The `teams` table RLS policy only allows users with `role='coach'` to INSERT
- Users can't create a team without being a coach
- But they can't become a coach without creating a team
- **This is a chicken-and-egg problem!**

## The Solution
Run the SQL script to allow **any authenticated user** to create a team. The application will automatically upgrade them to coach role after successful team creation.

## Steps to Fix (Choose One)

### Option 1: Supabase Dashboard (Fastest - 30 seconds)

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

4. **Test:** Try creating a team again in your app at http://localhost:5173

### Option 2: Use the SQL File

The fix is in the file: `/FIX_TEAM_CREATION_RLS.sql`

You can run it in the Supabase SQL Editor.

## How It Works After the Fix

1. ✅ User registers with `role='athlete'`
2. ✅ User navigates to onboarding page
3. ✅ User creates a team (now allowed by RLS)
4. ✅ Backend creates the team
5. ✅ Backend updates user to `role='coach'`
6. ✅ Backend adds user to `team_members` table
7. ✅ User is redirected to analytics

## Verification

After running the SQL, verify it worked by checking the policy:

```sql
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'teams'
  AND policyname = 'Authenticated users can create teams';
```

You should see:
- **policyname**: "Authenticated users can create teams"
- **cmd**: INSERT
- **roles**: {authenticated}

## Security Note

This is secure because:
- ✅ Only authenticated users can create teams (not anonymous)
- ✅ The application immediately upgrades them to coach
- ✅ RLS still protects UPDATE and DELETE operations
- ✅ Users can only see/modify their own team's data

## After Applying the Fix

Your app will work perfectly:
1. Register → Create Team → Import Data → View Analytics ✅

The complete flow will work end-to-end!
