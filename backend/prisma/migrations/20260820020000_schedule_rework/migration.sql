-- Practice plans + Schedule rework: one shared plan per day instead of a
-- per-group row with granular tier/focus/duration/distance fields.
-- Destructive on practice_plan_assignments by explicit request — the
-- season hadn't started, nothing there needed preserving.

DROP TABLE "practice_plan_assignments";

ALTER TABLE "practice_plans" DROP COLUMN "title";
ALTER TABLE "practice_plans" DROP COLUMN "team_notes";
ALTER TABLE "practice_plans" DROP COLUMN "location";

ALTER TABLE "practice_plans" ADD COLUMN "location_id" UUID;
ALTER TABLE "practice_plans" ADD COLUMN "announcements" TEXT;
ALTER TABLE "practice_plans" ADD COLUMN "pre_run" TEXT;
ALTER TABLE "practice_plans" ADD COLUMN "run" TEXT;
ALTER TABLE "practice_plans" ADD COLUMN "post_run" TEXT;
ALTER TABLE "practice_plans" ADD COLUMN "workout_template_id" UUID;
ALTER TABLE "practice_plans" ADD COLUMN "interval_session_id" UUID;

CREATE TABLE "practice_locations" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practice_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_locations_team_id_name_key" ON "practice_locations"("team_id", "name");

ALTER TABLE "practice_locations" ADD CONSTRAINT "practice_locations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "practice_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_workout_template_id_fkey" FOREIGN KEY ("workout_template_id") REFERENCES "workout_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_interval_session_id_fkey" FOREIGN KEY ("interval_session_id") REFERENCES "interval_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Traceability for "duplicate this interval sheet for my group" (a fully
-- independent new row, this just records where it came from).
ALTER TABLE "interval_sessions" ADD COLUMN "duplicated_from_id" UUID;
ALTER TABLE "interval_sessions" ADD CONSTRAINT "interval_sessions_duplicated_from_id_fkey" FOREIGN KEY ("duplicated_from_id") REFERENCES "interval_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
