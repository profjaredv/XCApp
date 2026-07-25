-- Adds the link this app never had between a signed-in User and a specific
-- Athlete roster row, plus the two real tables backing invite/claim (the
-- frontend already called endpoints for both; neither existed on the
-- backend — routes/team.js's pending-claims handler even said so directly:
-- "there is no pending_claims table"), and a TrainingLog table for
-- self-reported training efforts, kept separate from race Results on
-- purpose (see prisma/schema.prisma for why).

-- AlterTable
ALTER TABLE "athletes" ADD COLUMN "user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "athletes_user_id_key" ON "athletes"("user_id");

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "athlete_invites" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "athlete_invites_athlete_id_key" ON "athlete_invites"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_invites_token_key" ON "athlete_invites"("token");

-- CreateIndex
CREATE INDEX "athlete_invites_team_id_idx" ON "athlete_invites"("team_id");

-- AddForeignKey
ALTER TABLE "athlete_invites" ADD CONSTRAINT "athlete_invites_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_invites" ADD CONSTRAINT "athlete_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "athlete_claims" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "match_score" INTEGER,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "athlete_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "athlete_claims_team_id_status_idx" ON "athlete_claims"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_claims_athlete_id_user_id_key" ON "athlete_claims"("athlete_id", "user_id");

-- AddForeignKey
ALTER TABLE "athlete_claims" ADD CONSTRAINT "athlete_claims_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_claims" ADD CONSTRAINT "athlete_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_claims" ADD CONSTRAINT "athlete_claims_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "training_logs" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "distance_mi" DOUBLE PRECISION,
    "duration_sec" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_logs_athlete_id_date_idx" ON "training_logs"("athlete_id", "date");

-- AddForeignKey
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
