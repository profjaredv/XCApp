-- Manual (non-scraped) races, e.g. an in-house track time trial — see
-- Race.isManual's schema comment. Protects hand-entered data from the
-- scraper's per-season "wipe and re-create" re-import.
ALTER TABLE "races" ADD COLUMN "is_manual" BOOLEAN NOT NULL DEFAULT false;
