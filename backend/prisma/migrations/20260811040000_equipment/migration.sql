-- T6 (Team Management handoff): equipment and uniform checkout.

CREATE TYPE "EquipmentType" AS ENUM ('UNIFORM_TOP', 'UNIFORM_BOTTOM', 'WARMUP_TOP', 'WARMUP_BOTTOM', 'SPIKES', 'BAG', 'OTHER');
CREATE TYPE "EquipmentCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED');

CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "size" TEXT,
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'GOOD',
    "retired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equipment_team_id_type_identifier_key" ON "equipment"("team_id", "type", "identifier");

ALTER TABLE "equipment" ADD CONSTRAINT "equipment_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "equipment_assignments" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "checked_out_at" TIMESTAMP(3) NOT NULL,
    "checked_out_by" UUID,
    "due_date" DATE,
    "returned_at" TIMESTAMP(3),
    "returned_by" UUID,
    "condition_out" "EquipmentCondition",
    "condition_in" "EquipmentCondition",
    "notes" TEXT,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipment_assignments_athlete_id_season_id_idx" ON "equipment_assignments"("athlete_id", "season_id");
CREATE INDEX "equipment_assignments_equipment_id_returned_at_idx" ON "equipment_assignments"("equipment_id", "returned_at");

-- "An item is out when an assignment row exists with returnedAt null.
-- Enforce one active assignment per item." Application code checks this
-- before creating a row, but this partial unique index is the real
-- guarantee against two coaches checking out the same item at once —
-- Prisma's schema language has no way to express a WHERE clause on an
-- index, so this constraint lives only here. schema.prisma's
-- EquipmentAssignment model comment points back at this file.
CREATE UNIQUE INDEX "equipment_assignments_active_equipment_unique" ON "equipment_assignments"("equipment_id") WHERE "returned_at" IS NULL;

ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
