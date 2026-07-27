-- Phase 2 step 1 (XCApp Build Spec): capture each race's own Athletic.net
-- meet-results URL, so the Phase 2 meet scraper can navigate to it directly
-- instead of guessing or constructing meet URLs.

ALTER TABLE "races" ADD COLUMN "source_url" TEXT;
ALTER TABLE "races" ADD COLUMN "athletic_meet_id" TEXT;

CREATE INDEX "races_athletic_meet_id_idx" ON "races"("athletic_meet_id");

-- Purely additive, nullable columns — no backfill possible from existing
-- data (the URL was never captured before this migration). Existing races
-- stay NULL until their season is re-scraped with the patched scraper.
