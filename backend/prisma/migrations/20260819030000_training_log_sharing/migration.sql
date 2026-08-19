ALTER TABLE "training_logs" ADD COLUMN "shared_with_coach" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "training_logs" ADD COLUMN "shared_with_team" BOOLEAN NOT NULL DEFAULT false;
