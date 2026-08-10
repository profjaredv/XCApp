-- T1 (Team Management handoff), open question 2 resolved: read-only
-- guardian access, scoped to a guardian's own child, gated behind coach
-- approval (mirrors athlete_claims' pending/approved/rejected flow — a
-- stranger asserting "this is my kid" needs a human to confirm, same as an
-- athlete asserting "this roster row is me").

CREATE TABLE "guardian_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "guardian_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_links_user_id_athlete_id_key" ON "guardian_links"("user_id", "athlete_id");
CREATE INDEX "guardian_links_athlete_id_status_idx" ON "guardian_links"("athlete_id", "status");

ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
