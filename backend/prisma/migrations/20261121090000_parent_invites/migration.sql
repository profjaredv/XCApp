-- A coach inviting a parent by email with the athletes already chosen.
-- New table only; nothing existing changes.
CREATE TABLE "parent_invites" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "athlete_ids" UUID[],
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parent_invites_token_key" ON "parent_invites"("token");
CREATE INDEX "parent_invites_team_id_idx" ON "parent_invites"("team_id");
CREATE UNIQUE INDEX "parent_invites_team_id_email_key" ON "parent_invites"("team_id", "email");

ALTER TABLE "parent_invites" ADD CONSTRAINT "parent_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parent_invites" ADD CONSTRAINT "parent_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
