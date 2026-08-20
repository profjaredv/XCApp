-- Meets simplification: add home/away flag. Entries (meet_entries) and
-- logistics (meet_plans) tables are left in place — MeetEntry still backs
-- athlete-facing "entered" status; MeetPlan is unused by the app going
-- forward but not dropped in this migration.
ALTER TABLE "meets" ADD COLUMN "is_home" BOOLEAN;
