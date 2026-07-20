# Bug Fix Summary - Meet Metrics Calculation

## Root Cause Identified ✅

The massive pace calculation errors (13:34/mi instead of 6:27/mi) were caused by **incorrect `distance_meters` values** in the `races` table.

### The Problem

Some races had `distance_meters` stored as **miles** instead of **meters**:

| Race | Stored Value | Should Be | Impact |
|------|--------------|-----------|--------|
| Reed Park Time Trial (1 Miles) | 1 | 1609 | Pace calculated as 729,767 sec/mi ❌ |
| Ellensburg Relays (1.5 Miles) | 1.5 | 2414 | Pace calculated as 745,972 sec/mi ❌ |
| Sunfair (3 Miles) | 3 | 4828 | Pace calculated as 705,154 sec/mi ❌ |
| Fort Steilacoom (5K) | 5000 | 5000 | Pace calculated correctly at 449 sec/mi ✅ |

### Why This Happened

The calculation code divides by distance in miles:
```javascript
distanceMiles = distance_meters / 1609.34
pace = time / distanceMiles
```

When `distance_meters = 1` (should be 1609):
```javascript
distanceMiles = 1 / 1609.34 = 0.000621 miles  // ❌ WRONG!
pace = 453 seconds / 0.000621 miles = 729,467 sec/mi  // ❌ ABSURD!
```

When `distance_meters = 1609` (correct):
```javascript
distanceMiles = 1609 / 1609.34 = 1.0 miles  // ✅ Correct
pace = 453 seconds / 1.0 miles = 453 sec/mi  // ✅ Correct (7:33/mi)
```

## Fixes Applied

### 1. Data Fix (SQL Migration)
**File:** `supabase_migrations/06_fix_distance_meters.sql`

Converts incorrectly stored miles to meters:
- 1 mile → 1609 meters
- 1.5 miles → 2414 meters
- 3 miles → 4828 meters

### 2. Code Fix (Team Metrics)
**File:** `backend/services/performance/calculationServiceSupabase.js` line 534

**Before:**
```javascript
total_races: meetMetrics?.length || 0,  // ❌ Number of meets (7)
```

**After:**
```javascript
total_races: totalRaces,  // ✅ Total race results (630)
```

### 3. Schema Fixes (Missing Columns)
**Files:** `supabase_migrations/03_fix_team_season_metrics.sql`, `04_add_missing_metrics_columns.sql`

Added missing columns:
- `team_season_metrics.improvement_percent` (NUMERIC)
- `meet_performance_metrics.metrics` (JSONB)

## Steps to Fix

### 1. Run SQL Migration in Supabase
```sql
-- Run this in Supabase SQL Editor
-- File: supabase_migrations/06_fix_distance_meters.sql

UPDATE races
SET distance_meters = CASE 
    WHEN distance LIKE '%1 Mile%' AND distance_meters < 10 THEN 1609
    WHEN distance LIKE '%1.5 Mile%' AND distance_meters < 10 THEN 2414
    WHEN distance LIKE '%3 Mile%' AND distance_meters < 10 THEN 4828
    WHEN distance LIKE '%Mile%' AND distance_meters < 1000 THEN 
        ROUND(distance_meters * 1609.34)
    ELSE distance_meters
END
WHERE season = '2025' AND distance_meters < 1000;
```

### 2. Deploy Code Fix to Railway
The code fix has been committed. Deploy to Railway:
```bash
git push origin main
```

### 3. Recalculate Metrics
After deployment, go to Data Management page and click "Recalculate Metrics" for 2025.

## Expected Results After Fix

### Team Season Stats
- **Meets:** 7 ✅
- **Total Races:** ~630 (not 7) ✅
- **Total Miles:** ~1960 ✅
- **Avg Mile Pace:** ~387 sec/mi (6:27/mi, not 13:34/mi) ✅
- **Improvement:** ~5% (not 99%) ✅

### Season Pace Trend Chart
- All meets should show realistic paces (6:00-7:30/mi range)
- No more 0:00/mi values

### Meet Performance Metrics
All meets should have:
- `average_pace`: 360-450 sec/mi (6:00-7:30/mi)
- `average_time`: 1200-1400 seconds for 5K races
- `metrics` JSONB with gender/grade breakdowns

## Verification Queries

After recalculation, run these to verify:

```sql
-- Check team metrics
SELECT 
    total_athletes,
    meet_count,
    total_races,
    total_miles,
    average_pace,
    improvement_percent
FROM team_season_metrics
WHERE season = 2025;

-- Check meet metrics
SELECT 
    meet_name,
    meet_date,
    average_pace,
    average_time
FROM meet_performance_metrics
WHERE season = 2025
ORDER BY meet_date;

-- Check race distances
SELECT 
    name,
    distance,
    distance_meters,
    ROUND(distance_meters / 1609.34, 2) as miles
FROM races
WHERE season = '2025'
ORDER BY date;
```

## Lessons Learned

1. **Always validate data at import time** - The `distance_meters` should have been validated to ensure it's actually in meters
2. **Add data constraints** - Could add CHECK constraint: `distance_meters >= 1000 OR distance_meters IS NULL`
3. **Better error logging** - Should log when calculated pace is > 1000 sec/mi (impossible for humans)
4. **Unit tests** - Need tests for distance parsing edge cases

## Files Changed

1. `supabase_migrations/06_fix_distance_meters.sql` - Data fix
2. `backend/services/performance/calculationServiceSupabase.js` - Code fix
3. `CALCULATION_SPEC.md` - Documentation
4. `DEBUG_STEPS.md` - Debugging guide
5. `BUG_FIX_SUMMARY.md` - This file
