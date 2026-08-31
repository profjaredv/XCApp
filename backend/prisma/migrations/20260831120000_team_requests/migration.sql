-- Team setup requests as a first-class record.
--
-- These were previously filed as Feedback rows with severity 'blocker',
-- which put a request to join the product in the same queue as bug
-- reports, gave it no status to move through, and notified nobody —
-- POST /api/feedback never sent mail, so a coach who asked for a team
-- heard nothing and had no way to know it had been received.
--
-- Existing requests are NOT migrated out of feedback. They are real
-- messages a super admin has already seen in the feedback list, and
-- rewriting someone's submitted feedback into a different table would
-- lose the original text's context. New requests land here.

CREATE TABLE "team_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_team_id" UUID,
    "admin_note" TEXT,

    CONSTRAINT "team_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "team_requests_status_created_at_idx" ON "team_requests"("status", "created_at");

ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
