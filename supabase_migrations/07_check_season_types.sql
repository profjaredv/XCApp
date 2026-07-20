-- Check season column data types across all tables
-- This is causing query issues (text = integer errors)

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE column_name = 'season'
  AND table_schema = 'public'
ORDER BY table_name;

-- Expected: All should be TEXT or all should be INTEGER
-- Current issue: Mixed types causing comparison errors
