-- Phase 2 step 4 (XCApp Build Spec): field-relative normalization support.
--
-- field_results holds OTHER SCHOOLS' finishers, scraped from a meet's full
-- results page, purely to compute the aggregate figures below. It is never
-- linked to a User or Athlete and must never be exposed as a named-row
-- endpoint for athletes outside the requesting team — aggregate reads only.
--
-- races.field_mean_sec / field_median_sec / field_finisher_count are
-- computed and written by the (not-yet-built) meet scraper's ingest step,
-- gender-specific. Purely additive/nullable — no data migrated here.

CREATE TABLE "field_results" (
    "id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "athlete_name" TEXT NOT NULL,
    "school_name" TEXT,
    "gender" TEXT,
    "grade" INTEGER,
    "time_sec" DOUBLE PRECISION,
    "place" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'FINISHED',

    CONSTRAINT "field_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "field_results_race_id_idx" ON "field_results"("race_id");

ALTER TABLE "field_results" ADD CONSTRAINT "field_results_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "races" ADD COLUMN "field_mean_sec" DOUBLE PRECISION;
ALTER TABLE "races" ADD COLUMN "field_median_sec" DOUBLE PRECISION;
ALTER TABLE "races" ADD COLUMN "field_finisher_count" INTEGER;
