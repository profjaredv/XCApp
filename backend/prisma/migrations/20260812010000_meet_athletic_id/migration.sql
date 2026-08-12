-- Adds Meet.athletic_meet_id — the dedup key for importing a team's
-- Athletic.net calendar feed (lib/icalMeets.js). Importing the same feed
-- twice (preseason, then again mid-season) or importing the calendar and
-- later scraping results for the same meet must land on one Meet row, not
-- two. NULL stays allowed for hand-created meets with no Athletic.net
-- counterpart; Postgres unique indexes treat NULLs as distinct, so those
-- never collide with each other.

ALTER TABLE "meets" ADD COLUMN "athletic_meet_id" TEXT;

CREATE UNIQUE INDEX "meets_team_id_season_id_athletic_meet_id_key" ON "meets"("team_id", "season_id", "athletic_meet_id");
