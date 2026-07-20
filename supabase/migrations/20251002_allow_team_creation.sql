/*
  # Allow Team Creation for All Authenticated Users

  ## Problem
  The existing RLS policy only allows users with role='coach' to create teams.
  This creates a chicken-and-egg problem: users need to create a team to become a coach,
  but they can't create a team without being a coach.

  ## Solution
  1. Update the teams INSERT policy to allow any authenticated user to create a team
  2. Ensure team_members INSERT policy allows the creating user to add themselves
  3. The application logic will upgrade them to coach after team creation

  ## Changes
  1. Drop the restrictive "Coaches can create teams" policy on teams table
  2. Create a new "Authenticated users can create teams" policy
  3. Verify team_members INSERT policy is correct
*/

-- ============================================================================
-- 1. Fix Teams Table - Allow any authenticated user to create a team
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can create teams" ON teams;

CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 2. Ensure team_members allows users to add themselves
-- ============================================================================

-- The existing policy "Users can join teams" already handles this correctly
-- It checks: WITH CHECK (user_id = (SELECT auth.uid()))
-- This is correct and allows users to add themselves to teams
