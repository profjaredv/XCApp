-- Explicit finish status, replacing the implicit `time > 0` convention used
-- across ~12 query sites to mean "not a real finish".

CREATE TYPE "ResultStatus" AS ENUM ('FINISHED', 'DNF', 'DNS', 'DQ');

ALTER TABLE "results" ADD COLUMN "status" "ResultStatus" NOT NULL DEFAULT 'FINISHED';

-- Backfill assumption (flagged for review, not certain): every existing row
-- with no time or a non-positive time is labeled DNF. This is inferred, not
-- verified against source data — the Athletic.net scraper never creates a
-- Result row at all for an athlete who has no time cell in a given meet's
-- column (see scrape_season_playwright.js), so a DNS athlete typically has
-- no row here to backfill in the first place; existing null/<=0-time rows
-- are far more likely to be an athlete who started and didn't finish than a
-- DQ, which is comparatively rare in XC. If any of these are actually DNS
-- or DQ, they should be corrected by hand — this migration does not attempt
-- to distinguish the three.
UPDATE "results" SET "status" = 'DNF' WHERE "time" IS NULL OR "time" <= 0;
