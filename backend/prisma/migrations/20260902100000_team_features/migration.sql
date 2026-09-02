-- Which optional parts of the app a team uses.
--
-- Nullable on purpose: NULL means "never configured", which is every
-- existing team, and resolves to every feature ON (lib/teamFeatures.js).
-- Only keys a coach actually changed are ever written, so a feature added
-- to the catalog later starts enabled for existing teams rather than
-- silently disappearing from their app.

ALTER TABLE "teams" ADD COLUMN "features" JSONB;
