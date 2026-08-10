-- T1 (Team Management handoff): captain designation. Per-season, on
-- season_roster (captaincy is annual and a captain is still an athlete who
-- trains and races — not a TeamRole, not a permanent Athlete flag). Purely
-- additive/nullable; grants no data access by itself.

ALTER TABLE "season_roster" ADD COLUMN "is_captain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "season_roster" ADD COLUMN "captain_notes" TEXT;
