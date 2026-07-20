-- Schema Verification Script
-- Run this in Supabase SQL Editor to see what columns exist vs what's expected

-- Check team_season_metrics columns
SELECT 
    'team_season_metrics' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'team_season_metrics'
ORDER BY ordinal_position;

-- Check if first_meet and last_meet columns exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'first_meet'
        ) THEN '✅ first_meet exists'
        ELSE '❌ first_meet MISSING'
    END as first_meet_status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'team_season_metrics' 
            AND column_name = 'last_meet'
        ) THEN '✅ last_meet exists'
        ELSE '❌ last_meet MISSING'
    END as last_meet_status;

-- Check meet_performance_metrics columns
SELECT 
    'meet_performance_metrics' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'meet_performance_metrics'
ORDER BY ordinal_position;

-- Check athlete_season_metrics columns
SELECT 
    'athlete_season_metrics' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'athlete_season_metrics'
ORDER BY ordinal_position;

-- Check all metrics tables exist
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_season_metrics') 
        THEN '✅ team_season_metrics exists'
        ELSE '❌ team_season_metrics MISSING'
    END as team_metrics,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meet_performance_metrics') 
        THEN '✅ meet_performance_metrics exists'
        ELSE '❌ meet_performance_metrics MISSING'
    END as meet_metrics,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'athlete_season_metrics') 
        THEN '✅ athlete_season_metrics exists'
        ELSE '❌ athlete_season_metrics MISSING'
    END as athlete_metrics;

-- Check for unique constraints
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('team_season_metrics', 'meet_performance_metrics', 'athlete_season_metrics')
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
ORDER BY tc.table_name, tc.constraint_type;

-- Check for indexes on foreign keys
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('team_season_metrics', 'meet_performance_metrics', 'athlete_season_metrics', 'results', 'races')
ORDER BY tablename, indexname;
