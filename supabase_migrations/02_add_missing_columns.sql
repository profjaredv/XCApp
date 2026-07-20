-- Comprehensive Migration: Add Missing Columns
-- This script safely adds columns that might be missing
-- Uses IF NOT EXISTS to avoid errors if columns already exist

-- ============================================================================
-- 1. team_season_metrics - Add first_meet and last_meet
-- ============================================================================
ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS first_meet JSONB,
ADD COLUMN IF NOT EXISTS last_meet JSONB;

COMMENT ON COLUMN team_season_metrics.first_meet IS 'First meet of season: {name, date, avgPace, avgTime}';
COMMENT ON COLUMN team_season_metrics.last_meet IS 'Last meet of season: {name, date, avgPace, avgTime}';

-- ============================================================================
-- 2. Ensure all timestamp columns exist
-- ============================================================================

-- team_season_metrics
ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ DEFAULT NOW();

-- meet_performance_metrics
ALTER TABLE meet_performance_metrics
ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ DEFAULT NOW();

-- athlete_season_metrics
ALTER TABLE athlete_season_metrics
ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 3. Ensure JSONB columns exist for detailed metrics
-- ============================================================================

-- meet_performance_metrics should have a metrics JSONB column
ALTER TABLE meet_performance_metrics
ADD COLUMN IF NOT EXISTS metrics JSONB;

COMMENT ON COLUMN meet_performance_metrics.metrics IS 'Full breakdown: {overall, byGender, byGrade}';

-- ============================================================================
-- 4. Ensure numeric columns have correct types
-- ============================================================================

-- These might have been created as different types, ensure they're numeric
-- Note: This will fail if data exists and can't be cast. Check first!

-- Uncomment if needed:
-- ALTER TABLE athlete_season_metrics 
-- ALTER COLUMN average_pace TYPE NUMERIC USING average_pace::numeric;

-- ALTER TABLE meet_performance_metrics 
-- ALTER COLUMN average_pace TYPE NUMERIC USING average_pace::numeric;

-- ============================================================================
-- 5. Add indexes for performance
-- ============================================================================

-- Index on foreign keys for faster joins
CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_athlete_id 
ON athlete_season_metrics(athlete_id);

CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_team_id 
ON athlete_season_metrics(team_id);

CREATE INDEX IF NOT EXISTS idx_athlete_season_metrics_season 
ON athlete_season_metrics(season);

CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_race_id 
ON meet_performance_metrics(race_id);

CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_team_id 
ON meet_performance_metrics(team_id);

CREATE INDEX IF NOT EXISTS idx_meet_performance_metrics_season 
ON meet_performance_metrics(season);

CREATE INDEX IF NOT EXISTS idx_team_season_metrics_team_id 
ON team_season_metrics(team_id);

CREATE INDEX IF NOT EXISTS idx_team_season_metrics_season 
ON team_season_metrics(season);

CREATE INDEX IF NOT EXISTS idx_results_race_id 
ON results(race_id);

CREATE INDEX IF NOT EXISTS idx_results_athlete_id 
ON results(athlete_id);

CREATE INDEX IF NOT EXISTS idx_races_team_id 
ON races(team_id);

CREATE INDEX IF NOT EXISTS idx_races_season 
ON races(season);

-- ============================================================================
-- 6. Add unique constraints if missing
-- ============================================================================

-- athlete_season_metrics: one record per athlete per season
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'athlete_season_metrics_unique'
    ) THEN
        ALTER TABLE athlete_season_metrics
        ADD CONSTRAINT athlete_season_metrics_unique 
        UNIQUE (athlete_id, team_id, season);
    END IF;
END $$;

-- meet_performance_metrics: one record per race per team
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'meet_performance_metrics_unique'
    ) THEN
        ALTER TABLE meet_performance_metrics
        ADD CONSTRAINT meet_performance_metrics_unique 
        UNIQUE (race_id, team_id);
    END IF;
END $$;

-- team_season_metrics: one record per team per season
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'team_season_metrics_unique'
    ) THEN
        ALTER TABLE team_season_metrics
        ADD CONSTRAINT team_season_metrics_unique 
        UNIQUE (team_id, season);
    END IF;
END $$;

-- ============================================================================
-- Verification Query
-- ============================================================================
SELECT 
    'Migration complete! Run 01_verify_schema.sql to verify all columns exist.' as status;
