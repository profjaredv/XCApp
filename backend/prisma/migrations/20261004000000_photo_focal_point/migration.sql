-- LeadPack Photos: per-tag focal point for the Build module's "move the
-- photo to see faces" control. Additive only: two new nullable columns.
-- Touches no existing row.

-- AlterTable
ALTER TABLE "photo_athletes" ADD COLUMN     "focal_x" DOUBLE PRECISION,
ADD COLUMN     "focal_y" DOUBLE PRECISION;
