-- F2/F4 (LeadPack Master Build Handoff): claim-a-team + checkout gate.
-- Additive except for one relaxation: teams.coach_uid becomes nullable so an
-- admin-created team can exist with no coach at all until it's claimed.
-- Every existing row already has a real coach_uid, so this loses no data.

ALTER TABLE "teams" ALTER COLUMN "coach_uid" DROP NOT NULL;

ALTER TABLE "teams" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "teams" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "teams" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "teams" ADD COLUMN "checkout_completed_at" TIMESTAMP(3);

CREATE TABLE "team_claims" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_claims_team_id_key" ON "team_claims"("team_id");
CREATE UNIQUE INDEX "team_claims_token_key" ON "team_claims"("token");

ALTER TABLE "team_claims" ADD CONSTRAINT "team_claims_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
