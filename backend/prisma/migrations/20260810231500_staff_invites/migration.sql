-- T1 (Team Management handoff): "Retire POST /api/profile/upgrade-to-coach
-- in favor of head-coach-issued invites." StaffInvite grants team
-- authority (HEAD_COACH/COACH/VOLUNTEER_COACH) to an invited email,
-- structurally parallel to the existing AthleteInvite but a separate model
-- since it doesn't link a roster row.

CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_invites_token_key" ON "staff_invites"("token");
CREATE UNIQUE INDEX "staff_invites_team_id_email_key" ON "staff_invites"("team_id", "email");
CREATE INDEX "staff_invites_team_id_idx" ON "staff_invites"("team_id");

ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
