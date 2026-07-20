-- Add first_meet and last_meet columns to team_season_metrics table
-- These store data about the first and last meets of the season for improvement tracking

ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS first_meet JSONB,
ADD COLUMN IF NOT EXISTS last_meet JSONB;

-- Add comment to explain the structure
COMMENT ON COLUMN team_season_metrics.first_meet IS 'First meet data: {name, date, avgPace, avgTime}';
COMMENT ON COLUMN team_season_metrics.last_meet IS 'Last meet data: {name, date, avgPace, avgTime}';

-- Example structure:
-- first_meet: {"name": "Meet Name", "date": "2025-09-01", "avgPace": 387.5, "avgTime": 1200.5}
-- last_meet: {"name": "Meet Name", "date": "2025-10-15", "avgPace": 375.2, "avgTime": 1163.2}
