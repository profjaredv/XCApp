-- What the sign-up wizard now captures before an account exists.
--
-- Previously a team request carried only free text: role was inferred from
-- which button the person pressed, and the team arrived as prose. Neither
-- could be acted on without reading and interpreting the message.
--
-- All three columns are nullable — existing requests predate the wizard,
-- and the plain form still works.

ALTER TABLE "team_requests" ADD COLUMN "role" TEXT;
ALTER TABLE "team_requests" ADD COLUMN "team_name" TEXT;
ALTER TABLE "team_requests" ADD COLUMN "wants_team_id" UUID;
