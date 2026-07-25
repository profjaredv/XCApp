-- Data migration: correct the grade/graduation-year off-by-one.
--
-- Every graduation_year ever written by this app (both the original
-- Windsurf-era import code and this session's rewrite, until the commit that
-- adds this migration) was computed as `season + (12 - grade)`. That treats
-- a senior racing in the fall of year S as graduating in spring of year S —
-- but a fall XC season year S is the start of school year (S, S+1), so a
-- senior racing that fall actually graduates in spring of S+1. The correct
-- formula is `season + 1 + (12 - grade)`, exactly one year higher.
--
-- Concretely: this made a currently-enrolled senior compute as already
-- graduated for the entire season they were racing in.
--
-- Every existing graduation_year in this database was written by the old
-- formula (there has been no window where the corrected formula could have
-- produced a value — this migration ships in the same deploy as the code
-- fix), so a blanket +1 is exactly correct and unambiguous.

-- Step 1: correct the stable fact (graduation_year).
UPDATE "athletes"
SET "graduation_year" = "graduation_year" + 1
WHERE "graduation_year" IS NOT NULL;

-- Step 2: recompute the denormalized per-season grade snapshot to match.
-- grade = 13 + season.year - athlete.graduation_year (using the now-corrected
-- graduation_year from step 1).
UPDATE "season_roster" sr
SET "grade" = 13 + s."year" - a."graduation_year"
FROM "seasons" s, "athletes" a
WHERE sr."season_id" = s."id"
  AND sr."athlete_id" = a."id"
  AND a."graduation_year" IS NOT NULL;
