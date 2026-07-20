/*
  # Fix Security and Performance Issues

  This migration addresses multiple database security and performance concerns:

  ## 1. Add Missing Indexes on Foreign Keys
  Adds indexes to improve query performance on foreign key lookups:
  - athlete_season_metrics: best_pace_race_id, best_time_5k_race_id, team_id
  - meet_performance_metrics: best_athlete_id, team_id
  - pending_claims: athlete_id, team_id

  ## 2. Optimize RLS Policies
  Wraps auth function calls in SELECT to prevent re-evaluation for each row.
  This significantly improves query performance at scale.

  ## 3. Fix Function Search Path
  Sets immutable search_path on update_updated_at_column function for security.

  ## Security Notes
  - All RLS policies remain functionally identical
  - Only performance optimizations are applied
  - No changes to access control logic
*/

-- ============================================================================
-- 1. Add Missing Indexes on Foreign Keys
-- ============================================================================

-- athlete_season_metrics indexes
CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_best_pace_race_id 
  ON athlete_season_metrics(best_pace_race_id);

CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_best_time_5k_race_id 
  ON athlete_season_metrics(best_time_5k_race_id);

CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_team_id 
  ON athlete_season_metrics(team_id);

CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_athlete_id 
  ON athlete_season_metrics(athlete_id);

-- meet_performance_metrics indexes
CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_best_athlete_id 
  ON meet_performance_metrics(best_athlete_id);

CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_team_id 
  ON meet_performance_metrics(team_id);

CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_race_id 
  ON meet_performance_metrics(race_id);

-- pending_claims indexes
CREATE INDEX IF NOT EXISTS idx_pending_claims_athlete_id 
  ON pending_claims(athlete_id);

CREATE INDEX IF NOT EXISTS idx_pending_claims_team_id 
  ON pending_claims(team_id);

CREATE INDEX IF NOT EXISTS idx_pending_claims_user_id 
  ON pending_claims(user_id);

-- ============================================================================
-- 2. Optimize RLS Policies - Wrap auth.uid() in SELECT
-- ============================================================================

-- Users table policies
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view team members" ON users;
CREATE POLICY "Users can view team members"
  ON users FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Teams table policies
DROP POLICY IF EXISTS "Coaches can create teams" ON teams;
CREATE POLICY "Coaches can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = (SELECT auth.uid()) AND role = 'coach'
    )
  );

DROP POLICY IF EXISTS "Coaches can update their teams" ON teams;
CREATE POLICY "Coaches can update their teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (coach_uid = (SELECT auth.uid()))
  WITH CHECK (coach_uid = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Team members can view their team" ON teams;
CREATE POLICY "Team members can view their team"
  ON teams FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Team members table policies
DROP POLICY IF EXISTS "Team members can view team membership" ON team_members;
CREATE POLICY "Team members can view team membership"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can join teams" ON team_members;
CREATE POLICY "Users can join teams"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Pending claims table policies
DROP POLICY IF EXISTS "Users can view their own claims" ON pending_claims;
CREATE POLICY "Users can view their own claims"
  ON pending_claims FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create claims" ON pending_claims;
CREATE POLICY "Users can create claims"
  ON pending_claims FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Coaches can view and manage claims for their teams" ON pending_claims;
CREATE POLICY "Coaches can view and manage claims for their teams"
  ON pending_claims FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

-- Athletes table policies
DROP POLICY IF EXISTS "Coaches can manage athletes" ON athletes;
CREATE POLICY "Coaches can manage athletes"
  ON athletes FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view athletes" ON athletes;
CREATE POLICY "Team members can view athletes"
  ON athletes FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Races table policies
DROP POLICY IF EXISTS "Coaches can manage races" ON races;
CREATE POLICY "Coaches can manage races"
  ON races FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view races" ON races;
CREATE POLICY "Team members can view races"
  ON races FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Results table policies
DROP POLICY IF EXISTS "Coaches can manage results" ON results;
CREATE POLICY "Coaches can manage results"
  ON results FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view results" ON results;
CREATE POLICY "Team members can view results"
  ON results FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Seasons table policies
DROP POLICY IF EXISTS "Coaches can manage seasons" ON seasons;
CREATE POLICY "Coaches can manage seasons"
  ON seasons FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view seasons" ON seasons;
CREATE POLICY "Team members can view seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Season roster table policies
DROP POLICY IF EXISTS "Coaches can manage season rosters" ON season_roster;
CREATE POLICY "Coaches can manage season rosters"
  ON season_roster FOR ALL
  TO authenticated
  USING (
    season_id IN (
      SELECT s.id FROM seasons s
      JOIN teams t ON s.team_id = t.id
      WHERE t.coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    season_id IN (
      SELECT s.id FROM seasons s
      JOIN teams t ON s.team_id = t.id
      WHERE t.coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view season rosters" ON season_roster;
CREATE POLICY "Team members can view season rosters"
  ON season_roster FOR SELECT
  TO authenticated
  USING (
    season_id IN (
      SELECT s.id FROM seasons s
      WHERE s.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
      )
    )
  );

-- Team season metrics table policies
DROP POLICY IF EXISTS "Coaches can manage team metrics" ON team_season_metrics;
CREATE POLICY "Coaches can manage team metrics"
  ON team_season_metrics FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view team metrics" ON team_season_metrics;
CREATE POLICY "Team members can view team metrics"
  ON team_season_metrics FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Athlete season metrics table policies
DROP POLICY IF EXISTS "Coaches can manage athlete metrics" ON athlete_season_metrics;
CREATE POLICY "Coaches can manage athlete metrics"
  ON athlete_season_metrics FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view athlete metrics" ON athlete_season_metrics;
CREATE POLICY "Team members can view athlete metrics"
  ON athlete_season_metrics FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- Meet performance metrics table policies
DROP POLICY IF EXISTS "Coaches can manage meet metrics" ON meet_performance_metrics;
CREATE POLICY "Coaches can manage meet metrics"
  ON meet_performance_metrics FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT id FROM teams WHERE coach_uid = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Team members can view meet metrics" ON meet_performance_metrics;
CREATE POLICY "Team members can view meet metrics"
  ON meet_performance_metrics FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 3. Fix Function Search Path
-- ============================================================================

-- Recreate the function with immutable search_path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;