-- A coach can confirm a meet's distance ahead of time, before any Race row
-- exists for it (this team's races only materialize once results are
-- scraped, after the meet) — see routes/meetOps.js's PUT /:meetId and
-- calculationService.applyMeetDistanceToPendingPredictions. Additive only.

-- AlterTable
ALTER TABLE "meets" ADD COLUMN "distance" TEXT;
ALTER TABLE "meets" ADD COLUMN "distance_meters" DOUBLE PRECISION;
