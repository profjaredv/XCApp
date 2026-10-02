-- LeadPack Photos (build spec: docs/leadpack-photos-build-spec.md), Phase 2
-- "Foundation". Additive only: one new column, four new tables, their
-- indexes and foreign keys. Touches no existing row, column, or
-- constraint.
--
-- Generated with `prisma migrate diff` against the replayed migration
-- history, then hand-trimmed to drop two unrelated statements that diff
-- also produced from pre-existing drift between this migration history and
-- schema.prisma (a teams_coach_uid_fkey rebuild and a
-- races.split_markers_meters default drop, plus a coach_up_acknowledgements
-- index rename) — none of which this feature touches or should carry.

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING', 'READY', 'HIDDEN');

-- CreateEnum
CREATE TYPE "PhotoTagSource" AS ENUM ('SELF', 'PARENT', 'COACH');

-- AlterTable
ALTER TABLE "athletes" ADD COLUMN     "photos_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "meet_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "taken_at" TIMESTAMPTZ(6),
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BIGINT,
    "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_athletes" (
    "photo_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "tagged_by" UUID,
    "source" "PhotoTagSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_athletes_pkey" PRIMARY KEY ("photo_id","athlete_id")
);

-- CreateTable
CREATE TABLE "picks" (
    "athlete_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "picks_pkey" PRIMARY KEY ("athlete_id","season_id","position")
);

-- CreateTable
CREATE TABLE "collages" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_object_key_key" ON "photos"("object_key");

-- CreateIndex
CREATE INDEX "photos_meet_id_taken_at_idx" ON "photos"("meet_id", "taken_at");

-- CreateIndex
CREATE INDEX "photos_team_id_status_idx" ON "photos"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "photos_team_id_sha256_key" ON "photos"("team_id", "sha256");

-- CreateIndex
CREATE INDEX "photo_athletes_athlete_id_idx" ON "photo_athletes"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "picks_athlete_id_season_id_photo_id_key" ON "picks"("athlete_id", "season_id", "photo_id");

-- CreateIndex
CREATE INDEX "collages_athlete_id_season_id_idx" ON "collages"("athlete_id", "season_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_meet_id_fkey" FOREIGN KEY ("meet_id") REFERENCES "meets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_athletes" ADD CONSTRAINT "photo_athletes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_athletes" ADD CONSTRAINT "photo_athletes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_athletes" ADD CONSTRAINT "photo_athletes_tagged_by_fkey" FOREIGN KEY ("tagged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_photo_id_athlete_id_fkey" FOREIGN KEY ("photo_id", "athlete_id") REFERENCES "photo_athletes"("photo_id", "athlete_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collages" ADD CONSTRAINT "collages_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collages" ADD CONSTRAINT "collages_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
