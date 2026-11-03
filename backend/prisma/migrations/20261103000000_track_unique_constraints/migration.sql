-- LeadPack Track & Field: the browser-based Event Progress import (same
-- fallback shape as the XC Results Grid import) needs to upsert a
-- TrackMeet/TrackResult in place when a coach re-pastes the same season
-- after a new meet, instead of duplicating every row. Both tables are
-- empty in production (the feature isn't live yet — see routes/track.js's
-- requireSuperAdmin gate), so this is purely additive, no backfill.
CREATE UNIQUE INDEX "track_meets_team_id_name_date_key" ON "track_meets"("team_id", "name", "date");

-- Postgres treats each NULL as distinct in a unique index, so relay rows
-- (athlete_id null) never collide with each other here — only individual
-- results dedupe, which is what this import actually writes today.
-- (Postgres identifiers cap at 63 bytes; the field-concatenated name
-- Prisma would otherwise generate here runs over that, so this one's
-- named explicitly instead of left to truncate silently.)
CREATE UNIQUE INDEX "track_results_dedupe_key" ON "track_results"("team_id", "track_meet_id", "event_id", "athlete_id", "round");
