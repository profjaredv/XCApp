-- Coach-adoption pass item 6: coach-led interval/tempo capture (a group's
-- "5 x 800" workout, recorded on a grid instead of paper), plus write-back
-- into the athlete's own training log.

CREATE TABLE "interval_sessions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "group_id" UUID,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "rep_distance_m" INTEGER NOT NULL,
    "zone" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interval_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interval_sessions_team_id_season_id_date_idx" ON "interval_sessions"("team_id", "season_id", "date");

ALTER TABLE "interval_sessions" ADD CONSTRAINT "interval_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interval_sessions" ADD CONSTRAINT "interval_sessions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interval_sessions" ADD CONSTRAINT "interval_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interval_sessions" ADD CONSTRAINT "interval_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "interval_session_entries" (
    "id" UUID NOT NULL,
    "interval_session_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "added_manually" BOOLEAN NOT NULL DEFAULT false,
    "rep1" DOUBLE PRECISION,
    "rep2" DOUBLE PRECISION,
    "rep3" DOUBLE PRECISION,
    "rep4" DOUBLE PRECISION,
    "rep5" DOUBLE PRECISION,
    "rep6" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "interval_session_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interval_session_entries_interval_session_id_athlete_id_key" ON "interval_session_entries"("interval_session_id", "athlete_id");

ALTER TABLE "interval_session_entries" ADD CONSTRAINT "interval_session_entries_interval_session_id_fkey" FOREIGN KEY ("interval_session_id") REFERENCES "interval_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interval_session_entries" ADD CONSTRAINT "interval_session_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- training_logs: coach write-back. createdById stays null for the
-- ordinary athlete-self-reported row this table otherwise only holds.
ALTER TABLE "training_logs" ADD COLUMN "created_by" UUID;
ALTER TABLE "training_logs" ADD COLUMN "source_interval_session_entry_id" UUID;
ALTER TABLE "training_logs" ADD COLUMN "rep_splits" JSONB;

CREATE UNIQUE INDEX "training_logs_source_interval_session_entry_id_key" ON "training_logs"("source_interval_session_entry_id");

ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_source_interval_session_entry_id_fkey" FOREIGN KEY ("source_interval_session_entry_id") REFERENCES "interval_session_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
