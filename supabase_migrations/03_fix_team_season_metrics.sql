-- Fix team_season_metrics schema issues
-- Add missing improvement_percent column

ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS improvement_percent NUMERIC;

COMMENT ON COLUMN team_season_metrics.improvement_percent IS 'Percentage improvement from first to last meet';

-- Verify the fix
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'improvement_percent'
        ) THEN '✅ improvement_percent exists'
        ELSE '❌ improvement_percent MISSING'
    END as status;
