-- T3 (Team Management handoff): practice plans, per-group assignments, and
-- reusable workout templates. Insertion from a template COPIES fields into
-- a new practice_plan_assignments row — no foreign key to
-- workout_templates exists anywhere, on purpose, so editing a template
-- later can never retroactively change a plan that already used it.

CREATE TABLE "practice_plans" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "team_notes" TEXT,
    "location" TEXT,
    "start_time" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_plans_season_id_date_key" ON "practice_plans"("season_id", "date");
CREATE INDEX "practice_plans_season_id_date_idx" ON "practice_plans"("season_id", "date");

ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "practice_plan_assignments" (
    "id" UUID NOT NULL,
    "practice_plan_id" UUID NOT NULL,
    "group_id" UUID,
    "volume_tier" TEXT,
    "focus" TEXT,
    "duration_minutes" INTEGER,
    "distance_mi" DOUBLE PRECISION,
    "strength" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "practice_plan_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practice_plan_assignments_practice_plan_id_idx" ON "practice_plan_assignments"("practice_plan_id");

ALTER TABLE "practice_plan_assignments" ADD CONSTRAINT "practice_plan_assignments_practice_plan_id_fkey" FOREIGN KEY ("practice_plan_id") REFERENCES "practice_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_plan_assignments" ADD CONSTRAINT "practice_plan_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "workout_templates" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "volume_tier" TEXT,
    "focus" TEXT,
    "duration_minutes" INTEGER,
    "distance_mi" DOUBLE PRECISION,
    "strength" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workout_templates_team_id_name_key" ON "workout_templates"("team_id", "name");

ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
