-- Phase 2 step 5 (XCApp Build Spec): match athletes on a stable
-- Athletic.net-issued identifier instead of name string, which breaks on
-- duplicate names and name changes.
--
-- NOTE on rule 6 (ask before schema-destructive migrations): this drops the
-- UNIQUE constraint on athletes(team_id, name), replacing it with a plain
-- (non-unique) index. No rows are dropped or altered — every existing
-- athlete row is untouched — but the constraint that used to reject a
-- second "Jack Smith" on the same team no longer will. This is the change
-- the spec explicitly calls for ("Relax Athlete @@unique([teamId, name])
-- ... two students named Jack Smith is a normal occurrence"), not a
-- destructive drop of data, but flagged here per rule 6 since it does
-- relax a constraint rather than only add one.

DROP INDEX "athletes_team_id_name_key";

CREATE INDEX "athletes_team_id_name_idx" ON "athletes"("team_id", "name");

ALTER TABLE "athletes" ADD COLUMN "athletic_athlete_id" TEXT;

CREATE UNIQUE INDEX "athletes_athletic_athlete_id_key" ON "athletes"("athletic_athlete_id");
