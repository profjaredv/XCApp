-- How far into the postseason a race was.
--
-- Nullable, and null is the normal case: most races are regular season.
-- Coach-set rather than inferred — lib/postseason.js suggests a level from
-- the meet name, but "Penn State Invitational" contains the word state and
-- is not a state meet, so nothing writes this column without a person
-- confirming it.

CREATE TYPE "PostseasonLevel" AS ENUM ('LEAGUE', 'DISTRICT', 'REGIONAL', 'STATE', 'NATIONAL');

ALTER TABLE "races" ADD COLUMN "postseason_level" "PostseasonLevel";

-- Postseason counts are read per team per season; the existing
-- (team_id, season) index covers the scan, and this keeps the level filter
-- cheap on teams with a decade of races.
CREATE INDEX "races_team_id_season_postseason_level_idx" ON "races" ("team_id", "season", "postseason_level");
