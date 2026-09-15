-- Retired Athletic.net profile links, kept so a merge survives the next import.
--
-- Additive only: creates one table, touches no existing row or column.
CREATE TABLE "athlete_alias_ids" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "athletic_athlete_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_alias_ids_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "athlete_alias_ids_athletic_athlete_id_key" ON "athlete_alias_ids"("athletic_athlete_id");
CREATE INDEX "athlete_alias_ids_athlete_id_idx" ON "athlete_alias_ids"("athlete_id");
CREATE INDEX "athlete_alias_ids_team_id_idx" ON "athlete_alias_ids"("team_id");

ALTER TABLE "athlete_alias_ids" ADD CONSTRAINT "athlete_alias_ids_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "athlete_alias_ids" ADD CONSTRAINT "athlete_alias_ids_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
