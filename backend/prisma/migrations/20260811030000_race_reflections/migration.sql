-- T5 (Team Management handoff): race reflections. Pre-race goals lock
-- server-side once a race has started (see lib/raceReflections.js);
-- post-race fields never lock. sharedWithCoach defaults true, matching
-- paper, where handing the coach the sheet was the default.

CREATE TABLE "race_reflections" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "process_goal" TEXT,
    "outcome_goal" TEXT,
    "target_time_sec" DOUBLE PRECISION,
    "target_splits" JSONB,
    "key_focus" TEXT,
    "pre_submitted_at" TIMESTAMP(3),
    "feeling_rating" INTEGER,
    "effort_rating" INTEGER,
    "what_worked" TEXT,
    "what_didnt" TEXT,
    "post_notes" TEXT,
    "post_submitted_at" TIMESTAMP(3),
    "shared_with_coach" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "race_reflections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "race_reflections_athlete_id_race_id_key" ON "race_reflections"("athlete_id", "race_id");

ALTER TABLE "race_reflections" ADD CONSTRAINT "race_reflections_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "race_reflections" ADD CONSTRAINT "race_reflections_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;
