-- A team's own training-pace vocabulary (see the PaceZone model comment).
--
-- Custom zones only. The McMillan-style default set is a code constant and
-- is deliberately NOT seeded here: nothing is inserted for existing teams,
-- so this migration cannot change what any team already sees. A team that
-- has never opened the setting has zero rows and reads the defaults.

CREATE TABLE "pace_zones" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rule_type" TEXT NOT NULL,
    "ref_distance_meters" INTEGER,
    "offset_fast_sec" INTEGER,
    "offset_slow_sec" INTEGER,
    "range_distance_a_meters" INTEGER,
    "range_distance_b_meters" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pace_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pace_zones_team_id_idx" ON "pace_zones"("team_id");

-- One meaning per abbreviation: two zones both called "T" on the same
-- whiteboard is a setup mistake, and letting it into the table means every
-- reader has to decide which one wins.
CREATE UNIQUE INDEX "pace_zones_team_id_abbreviation_key" ON "pace_zones"("team_id", "abbreviation");

ALTER TABLE "pace_zones" ADD CONSTRAINT "pace_zones_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
