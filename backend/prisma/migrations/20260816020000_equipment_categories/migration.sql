-- Consolidate EquipmentType from 7 categories down to the 4 a coach
-- actually tracks on paper (Top/Bottom/Spikes/Other) — see
-- schema.prisma's Equipment model comment. Data-preserving: existing rows
-- are remapped, not dropped.
--   UNIFORM_TOP, WARMUP_TOP       -> TOP
--   UNIFORM_BOTTOM, WARMUP_BOTTOM -> BOTTOM
--   SPIKES                       -> SPIKES (unchanged)
--   BAG, OTHER                   -> OTHER

ALTER TYPE "EquipmentType" RENAME TO "EquipmentType_old";
CREATE TYPE "EquipmentType" AS ENUM ('TOP', 'BOTTOM', 'SPIKES', 'OTHER');

ALTER TABLE "equipment" ADD COLUMN "type_new" "EquipmentType";

UPDATE "equipment" SET "type_new" = CASE
  WHEN "type"::text IN ('UNIFORM_TOP', 'WARMUP_TOP') THEN 'TOP'::"EquipmentType"
  WHEN "type"::text IN ('UNIFORM_BOTTOM', 'WARMUP_BOTTOM') THEN 'BOTTOM'::"EquipmentType"
  WHEN "type"::text = 'SPIKES' THEN 'SPIKES'::"EquipmentType"
  ELSE 'OTHER'::"EquipmentType"
END;

ALTER TABLE "equipment" ALTER COLUMN "type_new" SET NOT NULL;

DROP INDEX "equipment_team_id_type_identifier_key";
ALTER TABLE "equipment" DROP COLUMN "type";
ALTER TABLE "equipment" RENAME COLUMN "type_new" TO "type";
CREATE UNIQUE INDEX "equipment_team_id_type_identifier_key" ON "equipment"("team_id", "type", "identifier");

DROP TYPE "EquipmentType_old";
