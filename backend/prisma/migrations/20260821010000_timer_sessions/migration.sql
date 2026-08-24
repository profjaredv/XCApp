-- Live Timer draft sessions — persists captured finish times before
-- they're assigned to athletes and saved as real Results, so a coach who
-- gets pulled away mid-assignment doesn't lose the capture. See
-- TimerSession's schema comment.
CREATE TABLE "timer_sessions" (
    "id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "created_by" UUID,
    "captures" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "assignments" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timer_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "timer_sessions_race_id_idx" ON "timer_sessions"("race_id");

CREATE INDEX "timer_sessions_team_id_idx" ON "timer_sessions"("team_id");

ALTER TABLE "timer_sessions" ADD CONSTRAINT "timer_sessions_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timer_sessions" ADD CONSTRAINT "timer_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timer_sessions" ADD CONSTRAINT "timer_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
