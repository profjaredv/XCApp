-- Check for meets that should have multiple distances
-- This will show races where results have different distances

SELECT 
  r.name AS race_name,
  r.date,
  r.distance AS race_distance,
  r.distance_meters AS race_distance_meters,
  COUNT(DISTINCT res.time) AS unique_results,
  COUNT(*) AS total_results,
  -- Check if results suggest multiple distances (e.g., times that don't match the race distance)
  MIN(res.time) AS fastest_time,
  MAX(res.time) AS slowest_time
FROM races r
JOIN results res ON res.race_id = r.id
WHERE r.season = '2025'
GROUP BY r.id, r.name, r.date, r.distance, r.distance_meters
HAVING COUNT(*) > 10  -- Only show races with significant participation
ORDER BY r.date;

-- Check for duplicate race names on same date (potential multi-distance issue)
SELECT 
  name,
  date,
  COUNT(*) AS race_count,
  STRING_AGG(DISTINCT distance, ', ') AS distances
FROM races
WHERE season = '2025'
GROUP BY name, date
HAVING COUNT(*) > 1;

-- Show Sunfair specifically
SELECT 
  r.id,
  r.name,
  r.date,
  r.distance,
  r.distance_meters,
  COUNT(res.id) AS result_count
FROM races r
LEFT JOIN results res ON res.race_id = r.id
WHERE r.name ILIKE '%sunfair%'
  AND r.season = '2025'
GROUP BY r.id, r.name, r.date, r.distance, r.distance_meters
ORDER BY r.date;
