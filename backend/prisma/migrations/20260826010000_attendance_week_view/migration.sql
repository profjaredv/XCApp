-- Two fixes prompted by real use of the attendance feature added in the
-- previous migration:
--
-- 1. AttendanceRecord.status now defaults to ABSENT (blank on the weekly
--    grid) instead of PRESENT (pre-checked) — a coach should check off who
--    showed, not uncheck who didn't.
--
-- 2. AttendanceSession gets a real uniqueness guarantee on
--    (team_id, season_id, date). There was none before: two coaches each
--    creating "today's" session independently (the single-day "New
--    session" dialog) could silently create two full-roster sessions for
--    the same date, which reads as every athlete "showing up twice" the
--    moment both are visible at once — the reported bug this closes off.
--    Existing duplicates (if any) are merged into the earliest session per
--    date before the constraint is added, moving each duplicate's records
--    onto the keeper (skipping any athlete already present there, rather
--    than erroring or silently dropping their row) so no attendance data
--    already recorded on a duplicate session is lost.

WITH ranked AS (
  SELECT id, team_id, season_id, date,
         ROW_NUMBER() OVER (PARTITION BY team_id, season_id, date ORDER BY created_at, id) AS rn
  FROM attendance_sessions
),
dupes AS (
  SELECT r1.id AS keep_id, r2.id AS dup_id
  FROM ranked r1
  JOIN ranked r2
    ON r1.team_id = r2.team_id AND r1.season_id = r2.season_id AND r1.date = r2.date
  WHERE r1.rn = 1 AND r2.rn > 1
)
UPDATE attendance_records ar
SET attendance_session_id = d.keep_id
FROM dupes d
WHERE ar.attendance_session_id = d.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM attendance_records ar2
    WHERE ar2.attendance_session_id = d.keep_id AND ar2.athlete_id = ar.athlete_id
  );

DELETE FROM attendance_sessions s
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id, season_id, date ORDER BY created_at, id) AS rn
  FROM attendance_sessions
) r
WHERE s.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS "attendance_sessions_team_id_season_id_date_idx";
CREATE UNIQUE INDEX "attendance_sessions_team_id_season_id_date_key" ON "attendance_sessions"("team_id", "season_id", "date");

ALTER TABLE "attendance_records" ALTER COLUMN "status" SET DEFAULT 'ABSENT';
