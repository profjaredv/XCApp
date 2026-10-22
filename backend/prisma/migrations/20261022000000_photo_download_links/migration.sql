-- A coach-sent, token-gated "download your photos" link, scoped to one
-- athlete and expiring (not single-use — see PhotoDownloadLink's own
-- schema comment on why).
-- CreateTable
CREATE TABLE "photo_download_links" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "sent_by" UUID,
    "sent_to" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_download_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photo_download_links_token_key" ON "photo_download_links"("token");

-- CreateIndex
CREATE INDEX "photo_download_links_athlete_id_idx" ON "photo_download_links"("athlete_id");

-- CreateIndex
CREATE INDEX "photo_download_links_expires_at_idx" ON "photo_download_links"("expires_at");

-- AddForeignKey
ALTER TABLE "photo_download_links" ADD CONSTRAINT "photo_download_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_download_links" ADD CONSTRAINT "photo_download_links_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_download_links" ADD CONSTRAINT "photo_download_links_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
