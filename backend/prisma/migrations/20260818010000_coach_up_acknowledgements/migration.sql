-- Coach-adoption follow-up: lets a coach dismiss one athlete off one
-- flagged list (watch/consistency/regression — see lib/coachUpAnalysis.js)
-- for one season, so the deterministic "Who to Watch" analysis stops
-- re-surfacing someone already dealt with. Season-scoped so a stale
-- acknowledgment never silently suppresses a fresh flag next year.

CREATE TABLE "coach_up_acknowledgements" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_up_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coach_up_acknowledgements_team_id_athlete_id_category_sea_key" ON "coach_up_acknowledgements"("team_id", "athlete_id", "category", "season");
CREATE INDEX "coach_up_acknowledgements_team_id_season_idx" ON "coach_up_acknowledgements"("team_id", "season");

ALTER TABLE "coach_up_acknowledgements" ADD CONSTRAINT "coach_up_acknowledgements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_up_acknowledgements" ADD CONSTRAINT "coach_up_acknowledgements_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_up_acknowledgements" ADD CONSTRAINT "coach_up_acknowledgements_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
