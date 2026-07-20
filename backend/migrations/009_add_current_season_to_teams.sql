-- Migration: Add current_season to teams table
-- This allows coaches to explicitly set which season is "current" for analysis

-- Add current_season column
ALTER TABLE teams ADD COLUMN IF NOT EXISTS current_season INTEGER;

-- Set default to most recent season with data for each team
UPDATE teams t
SET current_season = (
  SELECT season 
  FROM races 
  WHERE team_id = t.id 
  ORDER BY season DESC 
  LIMIT 1
)
WHERE current_season IS NULL;

-- Add comment
COMMENT ON COLUMN teams.current_season IS 'The season year that coaches tools and analytics should focus on';
