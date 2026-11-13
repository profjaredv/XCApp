-- Replaces the per-email Photos Admin invite with a single standing,
-- reusable code per team — see Team.photosAdminJoinCode's own schema
-- comment. The per-email invite table is dropped rather than kept
-- unused: nothing reads it anymore, and it carried no rows worth
-- preserving (the feature it belonged to shipped moments before this).
-- DropTable
DROP TABLE "photos_admin_invites";

-- AlterTable
ALTER TABLE "teams" ADD COLUMN "photos_admin_join_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "teams_photos_admin_join_code_key" ON "teams"("photos_admin_join_code");
