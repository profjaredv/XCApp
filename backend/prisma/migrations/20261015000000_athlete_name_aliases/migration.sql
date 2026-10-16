-- Names a coach confirmed belong to an existing athlete (results paste review).
--
-- Additive only: creates one table, touches no existing row or column.
CREATE TABLE "athlete_aliases" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "athlete_aliases_team_id_alias_key" ON "athlete_aliases"("team_id", "alias");
CREATE INDEX "athlete_aliases_athlete_id_idx" ON "athlete_aliases"("athlete_id");

ALTER TABLE "athlete_aliases" ADD CONSTRAINT "athlete_aliases_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_aliases" ADD CONSTRAINT "athlete_aliases_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
