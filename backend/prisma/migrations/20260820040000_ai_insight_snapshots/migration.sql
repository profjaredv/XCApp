-- AI Insights: persist the generated result per (team, season), gated on
-- raceCount/resultCount actually changing rather than a bare time-based
-- TTL, and persisted (not in-memory) so a deploy/restart doesn't silently
-- lose "already generated, nothing new" state.
CREATE TABLE "ai_insight_snapshots" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "race_count" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insight_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_insight_snapshots_team_id_idx" ON "ai_insight_snapshots"("team_id");

CREATE UNIQUE INDEX "ai_insight_snapshots_team_id_season_key" ON "ai_insight_snapshots"("team_id", "season");

ALTER TABLE "ai_insight_snapshots" ADD CONSTRAINT "ai_insight_snapshots_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
