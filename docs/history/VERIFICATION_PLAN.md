# Data Calculation Verification Plan

After re-importing and recalculating metrics, run these checks to ensure accuracy.

## Step 1: Verify Raw Data Import ✅

### Check Race Distances
```sql
-- All distances should be in METERS (not miles)
SELECT 
    name,
    distance,
    distance_meters,
    ROUND(distance_meters / 1609.34, 2) as miles_calculated
FROM races
WHERE season = 2025
ORDER BY date;
```

**Expected:**
- "1 Miles" → `distance_meters = 1609` (1.00 miles)
- "1.5 Miles" → `distance_meters = 2414` (1.50 miles)
- "3 Miles" → `distance_meters = 4828` (3.00 miles)
- "5,000 Meters" → `distance_meters = 5000` (3.11 miles)

**Red Flags:**
- ❌ Any `distance_meters < 100` (probably stored as miles)
- ❌ Any `distance_meters > 10000` (probably wrong)

---

### Check Season Types
```sql
-- All season columns should be INTEGER
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE column_name = 'season'
  AND table_schema = 'public'
ORDER BY table_name;
```

**Expected:** All should show `data_type = "integer"`

---

### Check Sample Results
```sql
-- Verify times are reasonable
SELECT 
    r.name as race_name,
    r.distance_meters,
    a.name as athlete_name,
    a.gender,
    res.time,
    ROUND(res.time / (r.distance_meters / 1609.34), 2) as pace_sec_per_mile,
    FLOOR((res.time / (r.distance_meters / 1609.34)) / 60) || ':' || 
    LPAD(ROUND((res.time / (r.distance_meters / 1609.34)) % 60)::text, 2, '0') as pace_formatted
FROM results res
JOIN races r ON res.race_id = r.id
JOIN athletes a ON res.athlete_id = a.id
WHERE r.season = 2025
ORDER BY r.date, res.time
LIMIT 20;
```

**Expected:**
- Times: 900-2000 seconds (15:00 - 33:00 for 5K)
- Pace: 300-500 sec/mi (5:00 - 8:20/mi)
- Formatted: "5:30" to "8:00" range

**Red Flags:**
- ❌ Pace > 600 sec/mi (10:00/mi) - too slow, likely calc error
- ❌ Pace < 250 sec/mi (4:10/mi) - too fast for high school
- ❌ Time > 2500 seconds (41+ minutes) - probably wrong

---

## Step 2: Verify Athlete Metrics ✅

```sql
-- Check athlete season metrics calculations
SELECT 
    name,
    gender,
    grade,
    total_races,
    total_miles,
    total_time_seconds,
    average_pace,
    -- Verify calculation: total_time / total_miles should equal average_pace
    ROUND(total_time_seconds / NULLIF(total_miles, 0), 2) as calculated_avg_pace,
    -- Format pace as MM:SS
    FLOOR(average_pace / 60) || ':' || LPAD(ROUND(average_pace % 60)::text, 2, '0') as pace_formatted,
    best_pace,
    best_time_5k,
    improvement
FROM athlete_season_metrics
WHERE season = 2025
  AND total_races > 0
ORDER BY average_pace
LIMIT 20;
```

**Expected:**
- `average_pace` should equal `calculated_avg_pace` (within 0.01)
- Average pace: 350-450 sec/mi (5:50 - 7:30/mi)
- Best pace: 300-400 sec/mi (5:00 - 6:40/mi)
- Improvement: -20% to +20% (negative = got slower)

**Red Flags:**
- ❌ `average_pace` ≠ `calculated_avg_pace` (calculation bug)
- ❌ `average_pace > 600` (10:00/mi+) - likely wrong
- ❌ `total_miles = 0` but `total_races > 0` - missing distance data

---

## Step 3: Verify Meet Metrics ✅

```sql
-- Check meet performance metrics
SELECT 
    meet_name,
    meet_date,
    distance,
    distance_label,
    participant_count,
    male_participant_count,
    female_participant_count,
    average_time,
    average_pace,
    -- Format pace
    FLOOR(average_pace / 60) || ':' || LPAD(ROUND(average_pace % 60)::text, 2, '0') as pace_formatted,
    best_time,
    team_score,
    -- Check if metrics JSONB exists
    CASE WHEN metrics IS NOT NULL THEN '✅ Has metrics' ELSE '❌ Missing metrics' END as has_metrics
FROM meet_performance_metrics
WHERE season = 2025
ORDER BY meet_date;
```

**Expected (for 5K races):**
- `average_time`: 1200-1500 seconds (20:00 - 25:00)
- `average_pace`: 380-480 sec/mi (6:20 - 8:00/mi)
- `best_time`: 900-1200 seconds (15:00 - 20:00)
- `participant_count`: 80-100
- All should have `metrics` JSONB

**Expected (for 1-mile races):**
- `average_time`: 400-600 seconds (6:40 - 10:00)
- `average_pace`: 400-600 sec/mi (6:40 - 10:00/mi)

**Red Flags:**
- ❌ `average_pace > 1000` - calculation error
- ❌ `average_pace = 0` - not calculated
- ❌ Missing `metrics` JSONB - column not populated

---

## Step 4: Verify Team Metrics ✅

```sql
-- Check team season metrics
SELECT 
    season,
    total_athletes,
    male_athlete_count,
    female_athlete_count,
    meet_count,
    total_races,
    total_miles,
    average_pace,
    -- Format pace
    FLOOR(average_pace / 60) || ':' || LPAD(ROUND(average_pace % 60)::text, 2, '0') as pace_formatted,
    improvement_percent,
    first_meet,
    last_meet,
    calculated_at
FROM team_season_metrics
WHERE season = 2025;
```

**Expected:**
- `total_athletes`: 110
- `male_athlete_count`: 73
- `female_athlete_count`: 37
- `meet_count`: 7
- `total_races`: 600-700 (total results across all athletes)
- `total_miles`: 1800-2200
- `average_pace`: 380-420 sec/mi (6:20 - 7:00/mi)
- `improvement_percent`: -10% to +15%
- `first_meet` and `last_meet` should have realistic `avgPace` (not 729,767!)

**Red Flags:**
- ❌ `total_races = 7` (that's meet count, not race count!)
- ❌ `average_pace > 600` (10:00/mi+) - calculation error
- ❌ `improvement_percent > 50%` - unrealistic
- ❌ `first_meet.avgPace > 1000` - calculation error

---

## Step 5: Cross-Check Calculations 🔍

### Verify Team Average Pace Calculation
```sql
-- Team average should match sum of athlete metrics
WITH athlete_totals AS (
    SELECT 
        SUM(total_time_seconds) as total_time,
        SUM(total_miles) as total_miles
    FROM athlete_season_metrics
    WHERE season = 2025
)
SELECT 
    t.average_pace as team_avg_pace,
    ROUND(a.total_time / a.total_miles, 2) as calculated_from_athletes,
    ROUND(t.average_pace - (a.total_time / a.total_miles), 2) as difference
FROM team_season_metrics t
CROSS JOIN athlete_totals a
WHERE t.season = 2025;
```

**Expected:** `difference` should be < 0.01 (basically 0)

---

### Verify Meet Count
```sql
-- Meet count should match number of races
SELECT 
    (SELECT meet_count FROM team_season_metrics WHERE season = 2025) as stored_meet_count,
    COUNT(DISTINCT id) as actual_meet_count,
    CASE 
        WHEN (SELECT meet_count FROM team_season_metrics WHERE season = 2025) = COUNT(DISTINCT id) 
        THEN '✅ Match' 
        ELSE '❌ Mismatch' 
    END as status
FROM races
WHERE season = 2025;
```

**Expected:** Both should be 7

---

### Verify Total Races
```sql
-- Total races should be sum of all athlete race counts
SELECT 
    (SELECT total_races FROM team_season_metrics WHERE season = 2025) as stored_total_races,
    SUM(total_races) as calculated_total_races,
    CASE 
        WHEN (SELECT total_races FROM team_season_metrics WHERE season = 2025) = SUM(total_races) 
        THEN '✅ Match' 
        ELSE '❌ Mismatch' 
    END as status
FROM athlete_season_metrics
WHERE season = 2025;
```

**Expected:** Both should be 600-700

---

## Step 6: UI Verification 🖥️

After SQL checks pass, verify in the UI:

### Team Season Stats Card
- **Meets:** 7 ✅
- **Total Races:** 600-700 (not 7!) ✅
- **Total Athletes:** 110 ✅
- **Avg Athletes/Race:** ~90 ✅
- **Total Miles Run:** 1800-2200 ✅
- **Avg Mile Pace:** 6:20 - 7:00/mi (not 13:34!) ✅

### Season Pace Trend Chart
- Should show 7 data points (one per meet)
- All paces should be in 6:00-8:00/mi range
- No "0:00/mi" values
- Should show improvement trend (line going down = faster)

### Top Improving Athletes
- Should show athletes with realistic improvement percentages
- Names should appear (not empty)
- Improvement: -20% to +20% range

### Meet Performance Table
- All 7 meets should appear
- Average pace: 6:00-8:00/mi range
- Participant counts: 80-100 per meet

---

## Step 7: Spot Check Individual Athletes 👤

Pick 3 athletes and manually verify their metrics:

```sql
-- Get detailed athlete data
SELECT 
    a.name,
    asm.total_races,
    asm.total_miles,
    asm.total_time_seconds,
    asm.average_pace,
    asm.best_pace,
    asm.best_time_5k,
    -- Show all their races
    (
        SELECT json_agg(json_build_object(
            'meet', r.name,
            'date', r.date,
            'time', res.time,
            'distance_miles', ROUND(r.distance_meters / 1609.34, 2),
            'pace', ROUND(res.time / (r.distance_meters / 1609.34), 2)
        ) ORDER BY r.date)
        FROM results res
        JOIN races r ON res.race_id = r.id
        WHERE res.athlete_id = a.id AND r.season = 2025
    ) as races
FROM athletes a
JOIN athlete_season_metrics asm ON a.id = asm.athlete_id
WHERE asm.season = 2025
  AND a.name ILIKE '%[ATHLETE NAME]%';
```

**Manually verify:**
1. Count races in JSON - should match `total_races`
2. Sum distances - should match `total_miles`
3. Sum times - should match `total_time_seconds`
4. Calculate avg pace - should match `average_pace`
5. Find min pace - should match `best_pace`

---

## Success Criteria ✅

All checks should pass:
- ✅ All distances in meters (1609, 2414, 4828, 5000)
- ✅ All season columns are INTEGER
- ✅ All paces in realistic range (300-500 sec/mi)
- ✅ Team average pace ~6:27/mi (not 13:34/mi)
- ✅ Total races ~630 (not 7)
- ✅ Meet count = 7
- ✅ All metrics JSONB populated
- ✅ Calculated values match stored values
- ✅ UI shows correct data
- ✅ No 0:00/mi in charts
- ✅ Improvement percentages realistic

---

## If Any Check Fails ❌

1. **Note which check failed**
2. **Run the diagnostic query from that section**
3. **Share the output with me**
4. **I'll identify the specific bug and create a fix**

Let me know when you're ready to run these checks!
