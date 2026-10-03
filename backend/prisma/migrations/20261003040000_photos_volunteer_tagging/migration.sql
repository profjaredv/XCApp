-- LeadPack Photos: no-account tagging access via a shared team password
-- (POST /api/photos/volunteer-login). Additive only: one new nullable
-- column, one new enum value, one new table and its indexes/foreign key.
-- Touches no existing row, column, or constraint.

-- AlterEnum
ALTER TYPE "PhotoTagSource" ADD VALUE 'VOLUNTEER';

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "photos_tag_password" TEXT;

-- CreateTable
CREATE TABLE "photo_volunteer_sessions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_volunteer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photo_volunteer_sessions_token_key" ON "photo_volunteer_sessions"("token");

-- CreateIndex
CREATE INDEX "photo_volunteer_sessions_team_id_idx" ON "photo_volunteer_sessions"("team_id");

-- AddForeignKey
ALTER TABLE "photo_volunteer_sessions" ADD CONSTRAINT "photo_volunteer_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
