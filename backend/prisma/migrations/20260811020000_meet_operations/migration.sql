-- T4 (Team Management handoff): meet operations. Adds the Meet parent
-- entity the schema previously lacked ("the current schema has Race but
-- no parent"), per-race entry status/seed times, and per-meet logistics.
-- Race.meet_id is added nullable and left unbackfilled here — grouping
-- existing scraped races into meets is a coach-reviewed proposal
-- (scripts/proposeMeetMapping.js / applyMeetMapping.js), never an
-- automatic migration-time guess.

CREATE TABLE "meets" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT,
    "source_url" TEXT,

    CONSTRAINT "meets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meets_season_id_date_idx" ON "meets"("season_id", "date");

ALTER TABLE "meets" ADD CONSTRAINT "meets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meets" ADD CONSTRAINT "meets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "EntryStatus" AS ENUM ('ENTERED', 'ALTERNATE', 'NOT_ENTERED', 'SCRATCHED', 'INJURED', 'ACADEMIC', 'EXCUSED');

CREATE TABLE "meet_entries" (
    "id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'NOT_ENTERED',
    "seed_time_sec" DOUBLE PRECISION,
    "bib_number" TEXT,
    "notes" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meet_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meet_entries_race_id_athlete_id_key" ON "meet_entries"("race_id", "athlete_id");
CREATE INDEX "meet_entries_race_id_status_idx" ON "meet_entries"("race_id", "status");

ALTER TABLE "meet_entries" ADD CONSTRAINT "meet_entries_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meet_entries" ADD CONSTRAINT "meet_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meet_entries" ADD CONSTRAINT "meet_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "meet_plans" (
    "id" UUID NOT NULL,
    "meet_id" UUID NOT NULL,
    "departure_time" TIMESTAMP(3),
    "return_time" TIMESTAMP(3),
    "departure_location" TEXT,
    "transport_notes" TEXT,
    "uniform_notes" TEXT,
    "bring_list" TEXT,
    "itinerary" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "meet_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meet_plans_meet_id_key" ON "meet_plans"("meet_id");

ALTER TABLE "meet_plans" ADD CONSTRAINT "meet_plans_meet_id_fkey" FOREIGN KEY ("meet_id") REFERENCES "meets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "races" ADD COLUMN "meet_id" UUID;
CREATE INDEX "races_meet_id_idx" ON "races"("meet_id");
ALTER TABLE "races" ADD CONSTRAINT "races_meet_id_fkey" FOREIGN KEY ("meet_id") REFERENCES "meets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
