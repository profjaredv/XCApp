-- Race prediction feature (lib/racePrediction.js). Additive only: one new
-- table and its indexes/foreign keys. Touches no existing row, column, or
-- constraint.

-- CreateTable
CREATE TABLE "race_predictions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "predicted_pace_sec_per_mile" DOUBLE PRECISION NOT NULL,
    "predicted_time_sec" DOUBLE PRECISION NOT NULL,
    "trend_pace_sec_per_mile" DOUBLE PRECISION NOT NULL,
    "course_difficulty_sec_per_mile" DOUBLE PRECISION,
    "based_on_race_count" INTEGER NOT NULL,
    "bias_applied_sec_per_mile" DOUBLE PRECISION,
    "margin_sec_per_mile" DOUBLE PRECISION,
    "predicted_splits" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actual_time_sec" DOUBLE PRECISION,
    "actual_pace_sec_per_mile" DOUBLE PRECISION,
    "error_sec_per_mile" DOUBLE PRECISION,
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "race_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "race_predictions_athlete_id_race_id_key" ON "race_predictions"("athlete_id", "race_id");

-- CreateIndex
CREATE INDEX "race_predictions_team_id_season_idx" ON "race_predictions"("team_id", "season");

-- CreateIndex
CREATE INDEX "race_predictions_athlete_id_idx" ON "race_predictions"("athlete_id");

-- AddForeignKey
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;
