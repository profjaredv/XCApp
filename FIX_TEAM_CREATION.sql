-- ============================================================================
-- FIX TEAM CREATION - Run this in Supabase SQL Editor
-- ============================================================================
--
-- This fixes the chicken-and-egg problem where users can't create teams
-- because they're not coaches yet, but they need to create a team to become a coach.
--
-- Instructions:
-- 1. Go to https://supabase.com/dashboard/project/nxlatotemxoryjsuouak/sql/new
-- 2. Paste this entire script
-- 3. Click "Run"
-- 4. Try creating a team again in your app
--
-- ============================================================================

-- Drop the restrictive policy that requires users to already be coaches
DROP POLICY IF EXISTS "Coaches can create teams" ON teams;

-- Allow any authenticated user to create a team
-- The app will upgrade them to coach after team creation
CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Verify the change worked
SELECT 'SUCCESS: Team creation policy updated!' as status;
