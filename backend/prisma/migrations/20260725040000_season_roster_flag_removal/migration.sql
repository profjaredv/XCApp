ALTER TABLE "season_roster" ADD COLUMN "flagged_for_removal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "season_roster" ADD COLUMN "flagged_for_removal_at" TIMESTAMP(3);
