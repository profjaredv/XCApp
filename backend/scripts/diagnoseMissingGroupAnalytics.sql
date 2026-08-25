-- Why does an athlete show blank in Group Analytics when you know they have
-- results? Run this in the Neon SQL console (same way
-- backfillDistanceMeters.sql is run) and read the sections in order — each
-- one rules out a specific cause, so the first section that looks wrong is
-- the answer.
--
-- Set the two values below and run the whole file.
--   :name  — matched loosely against athletes.name AND athletes.preferred_name
--   :year  — the season the data is expected in (e.g. 2025)
--
-- Neon's console doesn't do bind parameters, so edit these two literals:
--   'Callum Woods-Vallejo'  -> the athlete
--   2025                    -> the season with the known-good data
--   2026                    -> the season being VIEWED in the UI
--
-- Background: GET /api/groups/analytics (routes/groups.js) computes this
-- live — there is no metrics cache behind it and the frontend query sets no
-- staleTime — so a stale cache is NOT a possible explanation here. The
-- cause is always one of the five below.

-- ===========================================================================
-- 1. DUPLICATE ATHLETE ROWS  (the most likely cause on a CSV-imported roster)
-- ---------------------------------------------------------------------------
-- If this returns more than one row, the group points at one Athlete row and
-- the results hang off the other. That looks exactly like "no data" in the
-- group view while the athlete's own profile (reached from whichever row you
-- clicked) shows results fine. Fix with the merge tool: Data Management ->
-- merge athletes, which repoints results/memberships onto one row.
-- ===========================================================================
SELECT
  a.id,
  a.name,
  a.preferred_name,
  a.graduation_year,
  a.team_id,
  a.athletic_athlete_id,
  (SELECT COUNT(*) FROM results r WHERE r.athlete_id = a.id) AS total_results,
  (SELECT COUNT(*) FROM group_memberships gm WHERE gm.athlete_id = a.id AND gm.end_date IS NULL) AS active_memberships
FROM athletes a
WHERE a.name ILIKE '%Callum%' OR a.preferred_name ILIKE '%Callum%'
ORDER BY total_results DESC;

-- ===========================================================================
-- 2. THE RESULTS THEMSELVES — status, time, and the race's season/distance
-- ---------------------------------------------------------------------------
-- The analytics query requires ALL of:
--   status = 'FINISHED'    AND    time > 0    AND    races.season = <year>
-- and then needs a usable distance to turn the time into a pace.
--
-- Read the flags column:
--   NOT-FINISHED   -> excluded by the status filter. The 20260726 migration
--                     backfilled every row with a null/<=0 time to DNF, so a
--                     real finish marked DNF means the time was missing when
--                     that migration ran.
--   NO-TIME        -> excluded by time > 0.
--   NO-DISTANCE    -> INCLUDED by the query but yields no pace, and because
--                     summarizeRaces() returns null when NO race in a season
--                     is pace-computable, the athlete then falls through and
--                     renders identically to someone who never raced. This is
--                     the one failure mode that is invisible in the UI.
--   SEASON-MISMATCH-> the race is filed under a different season than its own
--                     date implies (e.g. a 2025 meet stored as season 2026),
--                     so it lands in neither the current nor the prior bucket
--                     the way you'd expect.
-- ===========================================================================
SELECT
  a.name              AS athlete,
  a.id                AS athlete_id,
  ra.name             AS race,
  ra.date,
  ra.season,
  ra.distance,
  ra.distance_meters,
  r.time,
  r.status,
  CONCAT_WS(' ',
    CASE WHEN r.status <> 'FINISHED'                    THEN 'NOT-FINISHED'     END,
    CASE WHEN r.time IS NULL OR r.time <= 0             THEN 'NO-TIME'          END,
    CASE WHEN COALESCE(ra.distance_meters, 0) <= 0
          AND (ra.distance IS NULL OR ra.distance = '') THEN 'NO-DISTANCE'      END,
    CASE WHEN ra.season <> EXTRACT(YEAR FROM ra.date)   THEN 'SEASON-MISMATCH'  END
  ) AS flags
FROM results r
JOIN athletes a ON a.id = r.athlete_id
JOIN races   ra ON ra.id = r.race_id
WHERE a.name ILIKE '%Callum%' OR a.preferred_name ILIKE '%Callum%'
ORDER BY ra.date DESC;

-- ===========================================================================
-- 3. GROUP MEMBERSHIP — is the athlete actually in the group being viewed?
-- ---------------------------------------------------------------------------
-- The analytics endpoint only reads memberships with end_date IS NULL. A
-- membership that was closed (end_date set) by a move still exists as a row
-- but is invisible here. Also confirm group.season_id is the season you're
-- looking at — group rosters are per-season.
-- ===========================================================================
SELECT
  a.name        AS athlete,
  g.name        AS group_name,
  g.type,
  g.archived,
  s.year        AS group_season_year,
  gm.start_date,
  gm.end_date,
  CASE WHEN gm.end_date IS NULL THEN 'ACTIVE' ELSE 'CLOSED — invisible to analytics' END AS membership_state
FROM group_memberships gm
JOIN athletes a ON a.id = gm.athlete_id
JOIN groups   g ON g.id = gm.group_id
JOIN seasons  s ON s.id = g.season_id
WHERE a.name ILIKE '%Callum%' OR a.preferred_name ILIKE '%Callum%'
ORDER BY s.year DESC, gm.start_date DESC;

-- ===========================================================================
-- 4. IS THIS ATHLETE-SPECIFIC, OR TEAM-WIDE?
-- ---------------------------------------------------------------------------
-- Counts of the same failure modes across the whole season. If NO-DISTANCE is
-- large, the fix is backfillDistanceMeters (scripts/backfillDistanceMeters.sql)
-- rather than anything athlete-specific.
-- ===========================================================================
SELECT
  ra.season,
  COUNT(*)                                                          AS results,
  COUNT(*) FILTER (WHERE r.status <> 'FINISHED')                    AS not_finished,
  COUNT(*) FILTER (WHERE r.time IS NULL OR r.time <= 0)             AS no_time,
  COUNT(*) FILTER (WHERE COALESCE(ra.distance_meters, 0) <= 0)      AS no_distance_meters,
  COUNT(*) FILTER (WHERE COALESCE(ra.distance_meters, 0) <= 0
                     AND (ra.distance IS NULL OR ra.distance = '')) AS no_distance_at_all,
  COUNT(*) FILTER (WHERE ra.season <> EXTRACT(YEAR FROM ra.date))   AS season_mismatch
FROM results r
JOIN races ra ON ra.id = r.race_id
GROUP BY ra.season
ORDER BY ra.season DESC;

-- ===========================================================================
-- 5. WHAT THE ANALYTICS QUERY ACTUALLY SEES
-- ---------------------------------------------------------------------------
-- The prior-season half of routes/groups.js GET /analytics, reproduced
-- verbatim for one athlete. Empty here + rows in section 2 = the filters are
-- what's dropping them, and section 2's flags say which one.
-- Change 2026 to whichever season the UI is currently showing.
-- ===========================================================================
SELECT
  a.name,
  ra.season,
  COUNT(*) AS results_the_query_can_see
FROM results r
JOIN athletes a ON a.id = r.athlete_id
JOIN races   ra ON ra.id = r.race_id
WHERE (a.name ILIKE '%Callum%' OR a.preferred_name ILIKE '%Callum%')
  AND r.status = 'FINISHED'
  AND r.time > 0
  AND ra.season < 2026
GROUP BY a.name, ra.season
ORDER BY ra.season DESC;
