-- Add unique constraint to prevent duplicate races with different distances
-- This ensures each combination of (name, date, team_id, distance) is unique

-- First, check if constraint already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_race_per_distance'
    ) THEN
        ALTER TABLE races
        ADD CONSTRAINT unique_race_per_distance 
        UNIQUE (name, date, team_id, distance);
        
        RAISE NOTICE 'Constraint unique_race_per_distance added successfully';
    ELSE
        RAISE NOTICE 'Constraint unique_race_per_distance already exists';
    END IF;
END $$;

-- Verify the constraint was added
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'unique_race_per_distance';
