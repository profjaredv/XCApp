-- Team.groupPhotoId: one photo shared across every athlete's collage back
-- page and the Slideshow collection's own template.
-- AlterTable
ALTER TABLE "teams" ADD COLUMN "group_photo_id" UUID;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_group_photo_id_fkey" FOREIGN KEY ("group_photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A coach's flat, ordered (by created_at) photo collection for an
-- end-of-season slideshow — see SlideshowItem's own schema comment.
-- CreateTable
CREATE TABLE "slideshow_items" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "added_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slideshow_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slideshow_items_season_id_photo_id_key" ON "slideshow_items"("season_id", "photo_id");

-- CreateIndex
CREATE INDEX "slideshow_items_season_id_created_at_idx" ON "slideshow_items"("season_id", "created_at");

-- AddForeignKey
ALTER TABLE "slideshow_items" ADD CONSTRAINT "slideshow_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slideshow_items" ADD CONSTRAINT "slideshow_items_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slideshow_items" ADD CONSTRAINT "slideshow_items_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slideshow_items" ADD CONSTRAINT "slideshow_items_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
