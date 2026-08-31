-- Training-log file import (Option 1 of the wearable-sync plan).
--
-- Adds provenance to training_logs so a row can say where it came from,
-- plus a batch record so an import can be undone as a unit.
--
-- Backfill posture: `source` defaults to 'manual', which is correct for
-- every athlete-typed row that already exists. The one existing exception
-- is the coach-recorded interval rows, which are relabelled below —
-- without that UPDATE the distinction the schema already draws (see
-- TrainingLog.createdById) would silently vanish into 'manual'.

ALTER TABLE "training_logs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "training_logs" ADD COLUMN "external_id" TEXT;
ALTER TABLE "training_logs" ADD COLUMN "started_at" TIMESTAMPTZ(6);
ALTER TABLE "training_logs" ADD COLUMN "avg_hr_bpm" INTEGER;
ALTER TABLE "training_logs" ADD COLUMN "elevation_ft" DOUBLE PRECISION;
ALTER TABLE "training_logs" ADD COLUMN "import_batch_id" UUID;

UPDATE "training_logs"
   SET "source" = 'interval_session'
 WHERE "source_interval_session_entry_id" IS NOT NULL;

CREATE TABLE "training_log_import_batches" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "file_name" TEXT,
    "rows_parsed" INTEGER NOT NULL,
    "rows_created" INTEGER NOT NULL,
    "rows_skipped" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_log_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_log_import_batches_athlete_id_created_at_idx"
    ON "training_log_import_batches"("athlete_id", "created_at");

-- Idempotent re-import. Postgres treats NULLs as distinct in a unique
-- index, so this constrains imported rows ONLY: manual and
-- interval_session rows have a null external_id and stay unconstrained,
-- which is what we want — an athlete can log two easy runs the same day
-- by hand, but dropping the same Strava archive twice must not double it.
CREATE UNIQUE INDEX "training_logs_athlete_id_source_external_id_key"
    ON "training_logs"("athlete_id", "source", "external_id");

ALTER TABLE "training_logs"
    ADD CONSTRAINT "training_logs_import_batch_id_fkey"
    FOREIGN KEY ("import_batch_id") REFERENCES "training_log_import_batches"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "training_log_import_batches"
    ADD CONSTRAINT "training_log_import_batches_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
