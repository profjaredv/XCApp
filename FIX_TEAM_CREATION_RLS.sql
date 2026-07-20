-- Fix Team Creation RLS Policy
-- This allows any authenticated user to create a team
-- The application will automatically upgrade them to coach role after creation

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Coaches can create teams" ON teams;

-- Allow any authenticated user to create a team
CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Verify the policy was created
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
