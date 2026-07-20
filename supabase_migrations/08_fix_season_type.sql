-- Fix season column type mismatch
-- races.season is TEXT, but all metrics tables use INTEGER
-- This causes "operator does not exist: text = integer" errors

-- First, check current data
SELECT 'BEFORE' as status, season, COUNT(*) 
FROM races 
GROUP BY season 
ORDER BY season;

-- Convert races.season from TEXT to INTEGER
ALTER TABLE races 
ALTER COLUMN season TYPE INTEGER USING season::integer;

-- Verify the fix
SELECT 'AFTER' as status, season, COUNT(*) 
FROM races 
GROUP BY season 
ORDER BY season;

-- Now all season columns are INTEGER:
-- ✅ races.season = integer
-- ✅ athlete_season_metrics.season = integer
-- ✅ meet_performance_metrics.season = integer
-- ✅ team_season_metrics.season = integer
