-- Plain-SQL equivalent of scripts/backfillDistanceMeters.js, for running
-- directly in the Neon SQL Editor (no Node/terminal access needed).
-- Hardcoded to this team's actual 5 distinct distance strings — confirmed
-- via `SELECT distance, COUNT(*) FROM races GROUP BY distance` — rather
-- than a general parser, since SQL isn't a great place to reimplement regex
-- parsing. If a 6th format ever shows up (new import, different team),
-- come back to lib/distance.js / the Node script instead of extending this.
--
-- Run each step IN ORDER. Steps 1 and 2 are read-only (SELECT) — look at
-- their output before running step 3, the actual UPDATE.

-- Step 1: safety check — any race whose distance ISN'T one of the 5 known
-- formats. This should return ZERO rows. If it returns anything, STOP —
-- don't run step 3 until those rows are accounted for (they'll be left
-- untouched by step 3 either way, but you should know they exist).
SELECT id, name, date, distance, distance_meters
FROM races
WHERE distance NOT IN ('5,000 Meters', '3 Miles', '1 Miles', '1.5 Miles', '2 Miles')
   OR distance IS NULL;

-- Step 2: preview — every race whose distance_meters would actually change.
-- This is very likely to return ZERO rows (the live import parser was
-- already correct), which would mean there's nothing to fix — that's a
-- good outcome, not a failure.
SELECT
  id, name, date, distance,
  distance_meters AS current_value,
  CASE distance
    WHEN '5,000 Meters' THEN 5000
    WHEN '3 Miles'      THEN 4828.02
    WHEN '1 Miles'      THEN 1609.34
    WHEN '1.5 Miles'    THEN 2414.01
    WHEN '2 Miles'      THEN 3218.68
  END AS correct_value
FROM races
WHERE distance IN ('5,000 Meters', '3 Miles', '1 Miles', '1.5 Miles', '2 Miles')
  AND distance_meters IS DISTINCT FROM (
    CASE distance
      WHEN '5,000 Meters' THEN 5000
      WHEN '3 Miles'      THEN 4828.02
      WHEN '1 Miles'      THEN 1609.34
      WHEN '1.5 Miles'    THEN 2414.01
      WHEN '2 Miles'      THEN 3218.68
    END
  );

-- Step 3: the actual write. Only touches rows that differ from step 2's
-- preview — a race already holding the correct value is left alone
-- (updated_at doesn't get bumped for no reason).
UPDATE races
SET distance_meters = CASE distance
    WHEN '5,000 Meters' THEN 5000
    WHEN '3 Miles'      THEN 4828.02
    WHEN '1 Miles'      THEN 1609.34
    WHEN '1.5 Miles'    THEN 2414.01
    WHEN '2 Miles'      THEN 3218.68
  END
WHERE distance IN ('5,000 Meters', '3 Miles', '1 Miles', '1.5 Miles', '2 Miles')
  AND distance_meters IS DISTINCT FROM (
    CASE distance
      WHEN '5,000 Meters' THEN 5000
      WHEN '3 Miles'      THEN 4828.02
      WHEN '1 Miles'      THEN 1609.34
      WHEN '1.5 Miles'    THEN 2414.01
      WHEN '2 Miles'      THEN 3218.68
    END
  );

-- Step 4: confirm — should return 0 rows (same query as step 2).
SELECT id, name, distance, distance_meters
FROM races
WHERE distance IN ('5,000 Meters', '3 Miles', '1 Miles', '1.5 Miles', '2 Miles')
  AND distance_meters IS DISTINCT FROM (
    CASE distance
      WHEN '5,000 Meters' THEN 5000
      WHEN '3 Miles'      THEN 4828.02
      WHEN '1 Miles'      THEN 1609.34
      WHEN '1.5 Miles'    THEN 2414.01
      WHEN '2 Miles'      THEN 3218.68
    END
  );
