-- T2 (Team Management handoff): training groups, captain groups, and any
-- future grouping share one model rather than three. GroupMembership is
-- effective-dated (start_date/end_date) — an athlete's group history is
-- preserved by closing a row and opening a new one, never by updating
-- group_id in place.

CREATE TYPE "GroupType" AS ENUM ('TRAINING', 'CAPTAIN', 'CUSTOM');

CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GroupType" NOT NULL,
    "gender" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "groups_season_id_name_key" ON "groups"("season_id", "name");
CREATE INDEX "groups_team_id_season_id_idx" ON "groups"("team_id", "season_id");

ALTER TABLE "groups" ADD CONSTRAINT "groups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "groups" ADD CONSTRAINT "groups_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_leaders" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "group_leaders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_leaders_group_id_user_id_key" ON "group_leaders"("group_id", "user_id");

ALTER TABLE "group_leaders" ADD CONSTRAINT "group_leaders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_leaders" ADD CONSTRAINT "group_leaders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "moved_by" UUID,
    "reason" TEXT,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_memberships_athlete_id_start_date_idx" ON "group_memberships"("athlete_id", "start_date");
CREATE INDEX "group_memberships_group_id_idx" ON "group_memberships"("group_id");

ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
