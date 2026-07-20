-- Fix Users Table RLS Policy
-- Allow the service role to create users during registration

-- First, check existing policies
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'users';

-- Drop restrictive policies if they exist
DROP POLICY IF EXISTS "Users can only see their own data" ON users;
DROP POLICY IF EXISTS "Users can only update their own data" ON users;

-- Allow service role to insert users (for registration)
CREATE POLICY "Service role can insert users"
  ON users FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow users to read their own data
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow authenticated users to insert their own user record
CREATE POLICY "Authenticated users can create own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Verify the policies
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'users'
ORDER BY cmd, policyname;
