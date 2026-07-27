-- Phase 2 step 2 (XCApp Build Spec): a real Course entity, replacing
-- Race.location free text / MeetGroup as the source of cross-season course
-- identity. Not team-scoped on purpose — two teams at the same venue share
-- one Course row, which is what makes cross-team field normalization work.
--
-- Purely additive: new table, new nullable FK column on races. No data is
-- migrated by this file — Race.course_id is populated only by
-- scripts/applyCourseMapping.js, and only after a coach has reviewed and
-- confirmed the proposed mapping (scripts/proposeCourseMapping.js). Do not
-- backfill course_id here.

CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "distance_meters" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courses_name_city_state_key" ON "courses"("name", "city", "state");

ALTER TABLE "races" ADD COLUMN "course_id" UUID;

CREATE INDEX "races_course_id_idx" ON "races"("course_id");

ALTER TABLE "races" ADD CONSTRAINT "races_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
