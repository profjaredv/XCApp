-- The calendar (iCal) link a coach pastes to import their meet schedule.
--
-- Additive only: one nullable column, no existing row changes.
ALTER TABLE "teams" ADD COLUMN "calendar_feed_url" TEXT;
