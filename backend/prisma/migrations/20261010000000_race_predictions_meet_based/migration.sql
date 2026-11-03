-- RacePrediction now predicts against a Meet (scheduled ahead of time, on
-- the team's calendar) instead of requiring a Race row to already exist.
-- For a team whose races only ever arrive via the season scraper, a Race
-- does not exist until AFTER the meet already happened — there was
-- nothing to attach a prediction to beforehand. No existing rows to
-- migrate: this table shipped with no reachable way yet for any team on
-- this workflow to have produced one.

-- AlterTable: race_id becomes optional, filled in once the real race
-- exists (see calculationService.reconcilePendingPredictions).
ALTER TABLE "race_predictions" ALTER COLUMN "race_id" DROP NOT NULL;

-- AlterTable: meet_id is the new stable identity for "which race this
-- predicts" — always present, unlike race_id.
ALTER TABLE "race_predictions" ADD COLUMN "meet_id" UUID NOT NULL;

-- AlterTable: the distance this prediction was actually computed
-- against, and whether it was a stand-in (this athlete's own most recent
-- race distance) rather than the race's own real, confirmed one.
ALTER TABLE "race_predictions" ADD COLUMN "distance_meters" DOUBLE PRECISION NOT NULL;
ALTER TABLE "race_predictions" ADD COLUMN "distance_estimated" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex: replaced by the meet-based uniqueness below.
DROP INDEX "race_predictions_athlete_id_race_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "race_predictions_athlete_id_meet_id_key" ON "race_predictions"("athlete_id", "meet_id");

-- CreateIndex
CREATE INDEX "race_predictions_meet_id_idx" ON "race_predictions"("meet_id");

-- AddForeignKey
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_meet_id_fkey" FOREIGN KEY ("meet_id") REFERENCES "meets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
