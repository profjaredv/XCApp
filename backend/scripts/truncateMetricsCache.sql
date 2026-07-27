-- Clears the three cached-metrics tables so they get recomputed by the
-- current (post distance-parser-consolidation) code, closing out any
-- residual doubt about whether an older, buggier code path ever wrote a
-- cached row. Not a fix for a known-wrong number — the hand-check already
-- confirmed the app's displayed totals were correct — this is precautionary
-- hygiene, run at the user's request.
--
-- Only touches team_season_metrics, athlete_season_metrics, and
-- meet_performance_metrics. Does NOT touch races, results, athletes, or
-- rosters — none of your actual source data. Fully recoverable either way:
-- these tables are pure caches, regenerated on demand.

-- Step 1: see what's there before clearing (informational).
SELECT
  (SELECT COUNT(*) FROM team_season_metrics) AS team_season_metrics_rows,
  (SELECT COUNT(*) FROM athlete_season_metrics) AS athlete_season_metrics_rows,
  (SELECT COUNT(*) FROM meet_performance_metrics) AS meet_performance_metrics_rows;

-- Step 2: the actual clear.
TRUNCATE TABLE team_season_metrics, athlete_season_metrics, meet_performance_metrics;

-- Step 3: confirm — all three should now read 0.
SELECT
  (SELECT COUNT(*) FROM team_season_metrics) AS team_season_metrics_rows,
  (SELECT COUNT(*) FROM athlete_season_metrics) AS athlete_season_metrics_rows,
  (SELECT COUNT(*) FROM meet_performance_metrics) AS meet_performance_metrics_rows;

-- After this: the app will show zero/blank stats for any season until you
-- recalculate. In the app, go to Analytics → pick each season that has
-- data (2024, 2025) → "Recalculate Metrics" (coach-only button, top of the
-- Analytics header). That repopulates these tables from the current code.
