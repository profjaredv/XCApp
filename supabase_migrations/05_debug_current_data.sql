-- Debug Current Data
-- Run these queries to see what's actually stored

-- 1. Check team season metrics (should show the summary stats)
SELECT 
    season,
    total_athletes,
    male_athlete_count,
    female_athlete_count,
    meet_count,
    total_races,
    total_miles,
    average_pace,
    improvement_percent,
    first_meet,
    last_meet,
    calculated_at
FROM team_season_metrics
WHERE season = 2025
ORDER BY calculated_at DESC
LIMIT 1;

-- 2. Check meet performance metrics (should show 7 meets)
SELECT 
    meet_name,
    meet_date,
    participant_count,
    male_participant_count,
    female_participant_count,
    average_time,
    average_pace,
    best_time,
    team_score,
    metrics
FROM meet_performance_metrics
WHERE season = 2025
ORDER BY meet_date;

-- 3. Sample athlete metrics (top 10 by pace)
SELECT 
    name,
    gender,
    grade,
    total_races,
    total_miles,
    average_pace,
    best_pace,
    best_time_5k,
    improvement
FROM athlete_season_metrics
WHERE season = 2025
ORDER BY average_pace
LIMIT 10;

-- 4. Check raw race data
SELECT 
    id,
    name,
    date,
    season,
    distance,
    distance_meters
FROM races
WHERE season = 2025
ORDER BY date;

-- 5. Sample results to verify times
SELECT 
    r.name as race_name,
    a.name as athlete_name,
    res.time,
    res.place
FROM results res
JOIN races r ON res.race_id = r.id
JOIN athletes a ON res.athlete_id = a.id
WHERE r.season = 2025
ORDER BY r.date, res.time
LIMIT 20;
