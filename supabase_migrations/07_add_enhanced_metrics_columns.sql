-- Add JSONB columns for enhanced metrics to team_season_metrics table
-- This allows us to store complex nested data structures for detailed breakdowns

ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS by_gender JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS by_grade JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS by_distance JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS team_depth JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pack_running JSONB DEFAULT NULL;

-- Add comment to document the structure
COMMENT ON COLUMN team_season_metrics.by_gender IS 'Gender breakdown: { men: { count, avgPace, bestTime, avgTime, totalRaces }, women: { ... } }';
COMMENT ON COLUMN team_season_metrics.by_grade IS 'Grade breakdown: { grade9: { count, avgPace, bestTime }, grade10: { ... }, grade11: { ... }, grade12: { ... } }';
COMMENT ON COLUMN team_season_metrics.by_distance IS 'Distance breakdown: { oneMile: { athleteCount, raceCount, avgTime, bestTime, avgPace }, onePointFiveMile: { ... }, threeMile: { ... }, fiveK: { ... } }';
COMMENT ON COLUMN team_season_metrics.team_depth IS 'Team depth metrics: { top5Spread, top7Spread, depthScore, varsityAvgTime, jvAvgTime }';
COMMENT ON COLUMN team_season_metrics.pack_running IS 'Pack running analysis: { avgGapBetweenRunners, packTightness, packConsistency, splitAnalysis }';

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'team_season_metrics'
  AND column_name IN ('by_gender', 'by_grade', 'by_distance', 'team_depth', 'pack_running');
