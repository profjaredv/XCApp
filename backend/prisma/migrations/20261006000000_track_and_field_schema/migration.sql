-- LeadPack Track & Field handoff (docs/leadpack-track-field-handoff.md),
-- Sections 1b, 2, 3: staff sport-scoping on the existing TeamMember/
-- StaffInvite tables, plus the new track event catalog and results stack
-- built parallel to Race/Result rather than merged into them. Season
-- itself needs no change — `sport` already exists there and already
-- defaults to 'XC'.

-- Section 1b: null (every existing row, migrated this way deliberately)
-- means this membership's role applies to every sport the team runs;
-- 'XC' | 'TRACK' narrows it to one. Nullable/additive, no backfill of a
-- non-null value needed — null is both the safe default and almost
-- certainly correct for anyone already on staff today.
ALTER TABLE "team_members" ADD COLUMN "sport" TEXT;
ALTER TABLE "staff_invites" ADD COLUMN "sport" TEXT;

-- Section 2: the track event catalog — reference data, not user rows.
CREATE TYPE "EventCategory" AS ENUM ('SPRINT', 'MIDDLE_DISTANCE', 'DISTANCE', 'HURDLES', 'RELAY', 'JUMP', 'THROW', 'MULTI');
CREATE TYPE "MarkUnit" AS ENUM ('SECONDS', 'METERS', 'FEET_INCHES', 'POINTS');
CREATE TYPE "ScoringDirection" AS ENUM ('LOWER_BETTER', 'HIGHER_BETTER');

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "unit" "MarkUnit" NOT NULL,
    "scoring_direction" "ScoringDirection" NOT NULL,
    "is_relay" BOOLEAN NOT NULL DEFAULT false,
    "relay_leg_count" INTEGER,
    "is_multi_event" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_name_key" ON "events"("name");

-- Section 3: TrackMeet/TrackResult, parallel to Race/Result.
CREATE TABLE "track_meets" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "season" INTEGER NOT NULL,
    "location" TEXT,
    "source_url" TEXT,
    "athletic_meet_id" TEXT,

    CONSTRAINT "track_meets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "track_meets_team_id_season_idx" ON "track_meets"("team_id", "season");

ALTER TABLE "track_meets" ADD CONSTRAINT "track_meets_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "track_results" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "track_meet_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "athlete_id" UUID,
    "gender" TEXT,
    "grade" INTEGER,
    "round" TEXT DEFAULT 'FINAL',
    "mark_value" DOUBLE PRECISION,
    "wind" DOUBLE PRECISION,
    "place" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'FINISHED',
    "relay_athlete_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "track_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "track_results_team_id_event_id_idx" ON "track_results"("team_id", "event_id");
CREATE INDEX "track_results_athlete_id_idx" ON "track_results"("athlete_id");

ALTER TABLE "track_results" ADD CONSTRAINT "track_results_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "track_results" ADD CONSTRAINT "track_results_track_meet_id_fkey" FOREIGN KEY ("track_meet_id") REFERENCES "track_meets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "track_results" ADD CONSTRAINT "track_results_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "track_results" ADD CONSTRAINT "track_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
