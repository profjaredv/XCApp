-- Fix distance_meters that were incorrectly stored as miles instead of meters
-- This is causing massive pace calculation errors (729,767 sec/mi instead of 450 sec/mi)

-- BEFORE: Show current bad data
SELECT 
    'BEFORE FIX' as status,
    name,
    distance,
    distance_meters,
    ROUND(distance_meters / 1609.34, 2) as distance_in_miles
FROM races
WHERE season = '2025'
ORDER BY date;

-- FIX: Convert miles to meters for races where distance_meters < 1000
UPDATE races
SET distance_meters = CASE 
    -- "1 Miles" -> 1609 meters
    WHEN distance LIKE '%1 Mile%' AND distance_meters < 10 THEN 1609
    -- "1.5 Miles" -> 2414 meters
    WHEN distance LIKE '%1.5 Mile%' AND distance_meters < 10 THEN 2414
    -- "3 Miles" -> 4828 meters
    WHEN distance LIKE '%3 Mile%' AND distance_meters < 10 THEN 4828
    -- Any other "X Miles" -> X * 1609.34
    WHEN distance LIKE '%Mile%' AND distance_meters < 1000 THEN 
        ROUND(distance_meters * 1609.34)
    ELSE distance_meters
END
WHERE season = '2025' AND distance_meters < 1000;

-- AFTER: Verify the fix
SELECT 
    'AFTER FIX' as status,
    name,
    distance,
    distance_meters,
    ROUND(distance_meters / 1609.34, 2) as distance_in_miles
FROM races
WHERE season = '2025'
ORDER BY date;

-- Expected output:
-- Reed Park Time Trial: 1 Miles -> 1609 meters (1.00 miles)
-- Ellensburg Relays: 1.5 Miles -> 2414 meters (1.50 miles)
-- Fort Steilacoom: 5,000 Meters -> 5000 meters (3.11 miles)
-- CWAC & MVL: 5,000 Meters -> 5000 meters (3.11 miles)
-- Sunfair: 3 Miles -> 4828 meters (3.00 miles)
-- CWAC Apple Ridge: 3 Miles -> 4828 meters (3.00 miles)
-- NIKE Hole in Wall: 5,000 Meters -> 5000 meters (3.11 miles)
