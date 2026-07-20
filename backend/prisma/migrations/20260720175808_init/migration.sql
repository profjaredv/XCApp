-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'athlete',
    "team_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "coach_uid" UUID NOT NULL,
    "join_code" TEXT NOT NULL,
    "athletic_team_id" TEXT NOT NULL,
    "imported_seasons" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "current_season" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athletes" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "grade" INTEGER,
    "graduation_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "season" INTEGER NOT NULL,
    "distance" TEXT,
    "distance_meters" DOUBLE PRECISION,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "time" DOUBLE PRECISION,
    "place" INTEGER,
    "grade" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_splits" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "mile_1" DOUBLE PRECISION,
    "mile_2" DOUBLE PRECISION,
    "mile_3" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "race_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'XC',
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_roster" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "grade" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_groups" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meet_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_group_races" (
    "id" UUID NOT NULL,
    "meet_group_id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_group_races_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_season_metrics" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "athlete_count" INTEGER,
    "male_athlete_count" INTEGER,
    "female_athlete_count" INTEGER,
    "meet_count" INTEGER,
    "total_races" INTEGER,
    "total_miles" DOUBLE PRECISION,
    "average_pace" DOUBLE PRECISION,
    "improvement_percent" DOUBLE PRECISION,
    "first_meet" JSONB,
    "last_meet" JSONB,
    "by_gender" JSONB,
    "by_grade" JSONB,
    "by_distance" JSONB,
    "team_depth" JSONB,
    "pack_running" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_season_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_season_metrics" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "name" TEXT,
    "gender" TEXT,
    "grade" INTEGER,
    "total_races" INTEGER,
    "total_miles" DOUBLE PRECISION,
    "total_time_seconds" DOUBLE PRECISION,
    "average_pace" DOUBLE PRECISION,
    "best_pace" DOUBLE PRECISION,
    "best_pace_race_id" UUID,
    "best_time_5k" DOUBLE PRECISION,
    "best_time_5k_race_id" UUID,
    "improvement_percent" DOUBLE PRECISION,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_season_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_performance_metrics" (
    "id" UUID NOT NULL,
    "race_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "meet_name" TEXT,
    "meet_date" DATE,
    "distance" DOUBLE PRECISION,
    "distance_label" TEXT,
    "participant_count" INTEGER,
    "male_participant_count" INTEGER,
    "female_participant_count" INTEGER,
    "average_time" DOUBLE PRECISION,
    "average_pace" DOUBLE PRECISION,
    "best_time" DOUBLE PRECISION,
    "best_athlete_id" UUID,
    "team_score" DOUBLE PRECISION,
    "boys_avg_pace" DOUBLE PRECISION,
    "boys_count" INTEGER,
    "girls_avg_pace" DOUBLE PRECISION,
    "girls_count" INTEGER,
    "metrics" JSONB,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_team_id_idx" ON "users"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_join_code_key" ON "teams"("join_code");

-- CreateIndex
CREATE UNIQUE INDEX "teams_athletic_team_id_key" ON "teams"("athletic_team_id");

-- CreateIndex
CREATE INDEX "teams_coach_uid_idx" ON "teams"("coach_uid");

-- CreateIndex
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "athletes_team_id_idx" ON "athletes"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_team_id_name_key" ON "athletes"("team_id", "name");

-- CreateIndex
CREATE INDEX "races_team_id_idx" ON "races"("team_id");

-- CreateIndex
CREATE INDEX "races_team_id_season_idx" ON "races"("team_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "races_team_id_name_date_distance_key" ON "races"("team_id", "name", "date", "distance");

-- CreateIndex
CREATE INDEX "results_race_id_idx" ON "results"("race_id");

-- CreateIndex
CREATE INDEX "results_athlete_id_idx" ON "results"("athlete_id");

-- CreateIndex
CREATE INDEX "results_team_id_idx" ON "results"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_athlete_id_race_id_key" ON "results"("athlete_id", "race_id");

-- CreateIndex
CREATE UNIQUE INDEX "race_splits_result_id_key" ON "race_splits"("result_id");

-- CreateIndex
CREATE INDEX "race_splits_athlete_id_idx" ON "race_splits"("athlete_id");

-- CreateIndex
CREATE INDEX "race_splits_race_id_idx" ON "race_splits"("race_id");

-- CreateIndex
CREATE INDEX "race_splits_team_id_idx" ON "race_splits"("team_id");

-- CreateIndex
CREATE INDEX "seasons_team_id_idx" ON "seasons"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_team_id_year_sport_key" ON "seasons"("team_id", "year", "sport");

-- CreateIndex
CREATE INDEX "season_roster_season_id_idx" ON "season_roster"("season_id");

-- CreateIndex
CREATE INDEX "season_roster_athlete_id_idx" ON "season_roster"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "season_roster_season_id_athlete_id_key" ON "season_roster"("season_id", "athlete_id");

-- CreateIndex
CREATE INDEX "meet_groups_team_id_idx" ON "meet_groups"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "meet_groups_team_id_group_name_key" ON "meet_groups"("team_id", "group_name");

-- CreateIndex
CREATE INDEX "meet_group_races_meet_group_id_idx" ON "meet_group_races"("meet_group_id");

-- CreateIndex
CREATE INDEX "meet_group_races_race_id_idx" ON "meet_group_races"("race_id");

-- CreateIndex
CREATE UNIQUE INDEX "meet_group_races_meet_group_id_race_id_key" ON "meet_group_races"("meet_group_id", "race_id");

-- CreateIndex
CREATE INDEX "team_season_metrics_team_id_idx" ON "team_season_metrics"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_season_metrics_team_id_season_key" ON "team_season_metrics"("team_id", "season");

-- CreateIndex
CREATE INDEX "athlete_season_metrics_team_id_idx" ON "athlete_season_metrics"("team_id");

-- CreateIndex
CREATE INDEX "athlete_season_metrics_athlete_id_idx" ON "athlete_season_metrics"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_season_metrics_athlete_id_team_id_season_key" ON "athlete_season_metrics"("athlete_id", "team_id", "season");

-- CreateIndex
CREATE INDEX "meet_performance_metrics_team_id_idx" ON "meet_performance_metrics"("team_id");

-- CreateIndex
CREATE INDEX "meet_performance_metrics_race_id_idx" ON "meet_performance_metrics"("race_id");

-- CreateIndex
CREATE UNIQUE INDEX "meet_performance_metrics_race_id_team_id_key" ON "meet_performance_metrics"("race_id", "team_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_coach_uid_fkey" FOREIGN KEY ("coach_uid") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "races" ADD CONSTRAINT "races_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_splits" ADD CONSTRAINT "race_splits_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_splits" ADD CONSTRAINT "race_splits_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_splits" ADD CONSTRAINT "race_splits_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_splits" ADD CONSTRAINT "race_splits_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_splits" ADD CONSTRAINT "race_splits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_roster" ADD CONSTRAINT "season_roster_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_roster" ADD CONSTRAINT "season_roster_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_groups" ADD CONSTRAINT "meet_groups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_group_races" ADD CONSTRAINT "meet_group_races_meet_group_id_fkey" FOREIGN KEY ("meet_group_id") REFERENCES "meet_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_group_races" ADD CONSTRAINT "meet_group_races_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_season_metrics" ADD CONSTRAINT "team_season_metrics_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_season_metrics" ADD CONSTRAINT "athlete_season_metrics_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_season_metrics" ADD CONSTRAINT "athlete_season_metrics_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_season_metrics" ADD CONSTRAINT "athlete_season_metrics_best_pace_race_id_fkey" FOREIGN KEY ("best_pace_race_id") REFERENCES "races"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_season_metrics" ADD CONSTRAINT "athlete_season_metrics_best_time_5k_race_id_fkey" FOREIGN KEY ("best_time_5k_race_id") REFERENCES "races"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_performance_metrics" ADD CONSTRAINT "meet_performance_metrics_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_performance_metrics" ADD CONSTRAINT "meet_performance_metrics_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_performance_metrics" ADD CONSTRAINT "meet_performance_metrics_best_athlete_id_fkey" FOREIGN KEY ("best_athlete_id") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

