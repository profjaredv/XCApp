-- A day's practice plan is one plan for the whole team. This adds the part
-- that differs by group: what the throwers do, what the jumpers do. One row
-- per group per plan; a group with no row just follows the team plan.
CREATE TABLE "practice_plan_group_parts" (
    "id" UUID NOT NULL,
    "practice_plan_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "details" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_plan_group_parts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "practice_plan_group_parts_practice_plan_id_group_id_key" ON "practice_plan_group_parts"("practice_plan_id", "group_id");
CREATE INDEX "practice_plan_group_parts_group_id_idx" ON "practice_plan_group_parts"("group_id");
ALTER TABLE "practice_plan_group_parts" ADD CONSTRAINT "practice_plan_group_parts_practice_plan_id_fkey" FOREIGN KEY ("practice_plan_id") REFERENCES "practice_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_plan_group_parts" ADD CONSTRAINT "practice_plan_group_parts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
