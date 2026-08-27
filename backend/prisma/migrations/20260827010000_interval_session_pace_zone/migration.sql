-- Point interval sessions at the team-defined pace-zone vocabulary.
--
-- interval_sessions.zone used to hold one of three Daniels/VDOT zone names.
-- It now holds a stable zone KEY: 'mcm-<id>' for one of the default zones,
-- or 'team:<ABBREVIATION>' for one the team defined itself.

ALTER TABLE "interval_sessions" ADD COLUMN "zone_label" TEXT;

-- The three legacy names, mapped to their equivalents in the default set.
-- These are the same zones under different authors' names — Daniels'
-- Threshold is a tempo effort, his Interval is VO2max work, his Repetition
-- is short speed work — so no session's meaning changes here, only its
-- label. zone_label is backfilled with the new display name so existing
-- sheets read correctly even if the team later redefines these.
UPDATE "interval_sessions" SET "zone" = 'mcm-tempo', "zone_label" = 'Tempo'    WHERE "zone" = 'threshold';
UPDATE "interval_sessions" SET "zone" = 'mcm-vo2',   "zone_label" = 'VO2 Max'  WHERE "zone" = 'interval';
UPDATE "interval_sessions" SET "zone" = 'mcm-speed', "zone_label" = 'Speed'    WHERE "zone" = 'repetition';

-- Anything that is somehow neither a legacy name nor already a valid key
-- would leave a session with no resolvable zone and no suggested paces.
-- Park those on the middle-of-the-road default rather than leaving a
-- dangling value, and mark them so the row says what happened.
UPDATE "interval_sessions"
   SET "zone" = 'mcm-vo2', "zone_label" = 'VO2 Max'
 WHERE "zone" NOT LIKE 'mcm-%' AND "zone" NOT LIKE 'team:%';
