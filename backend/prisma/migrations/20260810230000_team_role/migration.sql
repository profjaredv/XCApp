-- T1 (Team Management handoff): TeamMember.role becomes a real enum
-- instead of a free-text 'coach'|'athlete' string, so a volunteer coach or
-- a coach scoped to specific groups can be expressed. Per the handoff:
-- "anyone with role === 'coach' becomes HEAD_COACH on their current team."
--
-- The USING clause below only maps the two values this app has ever
-- written ('coach', 'athlete' — confirmed by grepping every
-- prisma.teamMember.create/upsert call site). Any other existing value
-- would cast to NULL and then fail the column's NOT NULL constraint,
-- aborting this migration rather than silently guessing a role for it —
-- intentional per rule 3 ("do not guess and proceed").

CREATE TYPE "TeamRole" AS ENUM ('HEAD_COACH', 'COACH', 'VOLUNTEER_COACH', 'ATHLETE');

ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "TeamRole" USING (
  CASE "role"
    WHEN 'coach' THEN 'HEAD_COACH'
    WHEN 'athlete' THEN 'ATHLETE'
  END
)::"TeamRole";

ALTER TABLE "team_members" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "team_members_team_id_role_idx" ON "team_members"("team_id", "role");
