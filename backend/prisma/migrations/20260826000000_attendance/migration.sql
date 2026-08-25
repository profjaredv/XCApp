-- Attendance tracking: a digitized version of the physical clipboard —
-- date/time/location plus a roster snapshot marked present/absent/
-- excused/late. See AttendanceSession/AttendanceRecord's schema comments.

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE');

CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "location_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_sessions_team_id_season_id_date_idx" ON "attendance_sessions"("team_id", "season_id", "date");

ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "practice_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "attendance_session_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_records_attendance_session_id_athlete_id_key" ON "attendance_records"("attendance_session_id", "athlete_id");
CREATE INDEX "attendance_records_athlete_id_idx" ON "attendance_records"("athlete_id");

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
