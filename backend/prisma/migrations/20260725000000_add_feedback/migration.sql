-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "team_id" UUID,
    "user_id" UUID,
    "user_email" TEXT,
    "user_role" TEXT,
    "route" TEXT NOT NULL,
    "screen" TEXT,
    "season" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'bug',
    "message" TEXT NOT NULL,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_team_id_idx" ON "feedback"("team_id");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");
