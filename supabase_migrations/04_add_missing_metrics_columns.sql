-- Add missing columns that code expects but database doesn't have

-- 1. Add improvement_percent to team_season_metrics
ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS improvement_percent NUMERIC;

COMMENT ON COLUMN team_season_metrics.improvement_percent IS 'Percentage improvement from first to last meet';

-- 2. Add metrics JSONB column to meet_performance_metrics
ALTER TABLE meet_performance_metrics
ADD COLUMN IF NOT EXISTS metrics JSONB;

COMMENT ON COLUMN meet_performance_metrics.metrics IS 'Full breakdown: {overall, byGender, byGrade} with detailed stats';

-- 3. Verify all critical columns exist
SELECT 
    'team_season_metrics.improvement_percent' as column_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'improvement_percent'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
UNION ALL
SELECT 
    'team_season_metrics.first_meet' as column_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'first_meet'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
UNION ALL
SELECT 
    'team_season_metrics.last_meet' as column_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'last_meet'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
UNION ALL
SELECT 
    'meet_performance_metrics.metrics' as column_check,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'meet_performance_metrics' 
            AND column_name = 'metrics'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status;
