-- Backfill: link scraped races to the meet they belong to.
--
-- Meets imported from the Athletic.net calendar linked only the races that
-- existed at import time; races the results scrape created afterwards kept
-- meet_id NULL, so those meets showed no results. Same rule as
-- backend/lib/meetLinking.js, which now runs after every scrape: same team,
-- same Athletic.net meet ID, race season = the meet's season year. Races a
-- coach already grouped (meet_id set) are never touched. Data only; no
-- schema change.
UPDATE "races" AS r
SET "meet_id" = m."id"
FROM "meets" AS m
JOIN "seasons" AS s ON s."id" = m."season_id"
WHERE r."meet_id" IS NULL
  AND r."athletic_meet_id" IS NOT NULL
  AND r."athletic_meet_id" = m."athletic_meet_id"
  AND r."team_id" = m."team_id"
  AND r."season" = s."year";
