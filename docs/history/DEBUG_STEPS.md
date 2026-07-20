# Debug Steps - Fix Wrong Calculations

## Current Issues Observed

1. **Average Pace shows 13:34/mi** (should be ~6:27/mi)
2. **Season Pace Trend shows 0:00/mi** for all meets
3. **Calculation summary shows 0 athletes, 0 races**

## Step 1: Check Database Values

Run this in Supabase SQL Editor:

```sql
-- Check team season metrics
SELECT 
    season,
    total_athletes,
    meet_count,
    total_races,
    total_miles,
    average_pace,  -- This should be ~387 (6:27/mi), NOT ~814 (13:34/mi)
    improvement_percent
FROM team_season_metrics
WHERE season = 2025
ORDER BY calculated_at DESC
LIMIT 1;
```

**Expected values:**
- `total_athletes`: 110
- `meet_count`: 7
- `total_races`: ~630 (total results, not meets)
- `total_miles`: ~1960
- `average_pace`: ~387 seconds/mile (6:27/mi)
- `improvement_percent`: some positive number

**If average_pace is ~814 instead of ~387:**
- This means it's storing total time instead of pace per mile
- Bug is in line 492 of calculationServiceSupabase.js

## Step 2: Check Meet Metrics

```sql
SELECT 
    meet_name,
    meet_date,
    participant_count,
    average_time,
    average_pace,  -- Should be ~370-400 sec/mi, NOT 0
    metrics
FROM meet_performance_metrics
WHERE season = 2025
ORDER BY meet_date;
```

**Expected:**
- Each meet should have `average_pace` between 360-420 seconds/mile
- `metrics` JSONB should contain full breakdown

**If average_pace is 0 or NULL:**
- Bug is in meet calculation (line 322)
- The `metrics.overall.avgMilePace.overall` is not being calculated

## Step 3: Check Sample Results

```sql
SELECT 
    r.name as race_name,
    r.distance_meters,
    a.name as athlete_name,
    res.time,
    -- Calculate what pace SHOULD be
    ROUND(res.time / (r.distance_meters / 1609.34), 2) as calculated_pace_sec_per_mi
FROM results res
JOIN races r ON res.race_id = r.id
JOIN athletes a ON res.athlete_id = a.id
WHERE r.season = 2025
ORDER BY r.date, res.time
LIMIT 10;
```

**Expected:**
- `time`: 1000-1500 seconds (16:40 - 25:00)
- `calculated_pace_sec_per_mi`: 320-480 (5:20 - 8:00 per mile)

## Step 4: Identify the Bug

### Scenario A: Team average_pace is wrong (814 instead of 387)

**Problem:** Line 492 in calculationServiceSupabase.js
```javascript
const avgPace = totalMiles > 0 ? totalTime / totalMiles : 0;
```

This is CORRECT. The bug must be elsewhere.

**Check:** Is `totalTime` being calculated correctly?
Line 490:
```javascript
const totalTime = athleteMetrics.reduce((sum, a) => sum + (parseFloat(a.total_time_seconds) || 0), 0);
```

**Possible issue:** Are athlete metrics storing wrong `total_time_seconds`?

### Scenario B: Meet average_pace is 0

**Problem:** Line 322 stores:
```javascript
average_pace: metrics.overall?.avgMilePace?.overall || 0
```

**Check:** Is `metrics.overall.avgMilePace.overall` being calculated?

Look at the `calculateMeetMetrics` function around line 380-460.

## Step 5: Fix Based on Findings

Once you run the SQL queries above, paste the results here and I'll identify the exact fix needed.

## Quick Test

Run this to see what ONE athlete's metrics look like:

```sql
SELECT 
    name,
    total_races,
    total_miles,
    total_time_seconds,
    average_pace,
    -- Calculate what it SHOULD be
    CASE 
        WHEN total_miles > 0 THEN ROUND(total_time_seconds / total_miles, 2)
        ELSE 0 
    END as calculated_avg_pace
FROM athlete_season_metrics
WHERE season = 2025
ORDER BY total_races DESC
LIMIT 5;
```

If `average_pace` ≠ `calculated_avg_pace`, then athlete metrics are being stored wrong.
