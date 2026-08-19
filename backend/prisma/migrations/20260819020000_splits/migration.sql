-- C3 (LeadPack Master Build Handoff): the new marker-based Split model,
-- one row per athlete per marker, cumulative from the gun. Additive only —
-- race_splits stays in place, unread, until this is live end to end.

ALTER TABLE "races" ADD COLUMN "split_marker_scheme" TEXT;
ALTER TABLE "races" ADD COLUMN "split_markers_meters" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];

CREATE TABLE "splits" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "marker_meters" DOUBLE PRECISION NOT NULL,
    "elapsed_sec" DOUBLE PRECISION NOT NULL,
    "team_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "splits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "splits_result_id_sequence_key" ON "splits"("result_id", "sequence");
CREATE INDEX "splits_result_id_idx" ON "splits"("result_id");
CREATE INDEX "splits_team_id_idx" ON "splits"("team_id");

ALTER TABLE "splits" ADD CONSTRAINT "splits_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "splits" ADD CONSTRAINT "splits_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "splits" ADD CONSTRAINT "splits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
