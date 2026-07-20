# Metrics Calculation Diagnostic Guide

## Current Issues (from screenshots)

1. **Meet Pace Values are Wrong**
   - Showing: `121624:47/mi`, `124432:52/mi`, `11752:34/mi`
   - Expected: `~6:30/mi` to `~7:30/mi`
   
2. **Athlete Metrics All Zero**
   - SB 5K: `0:00.0`
   - PR 5K: `0:00.0`
   - Races: `0`
   - Avg. Pace shows values like `7:18/mi` (these look correct)

3. **Race Visualization Empty**
   - Beeswarm plot not rendering
   - Full Results table empty

## Diagnostic Steps

### Step 1: Check Raw Database Values

Run these queries in Supabase SQL Editor:

```sql
-- Check meet metrics
SELECT 
  meet_name,
  meet_date,
  average_pace,
  average_time,
  participant_count,
  pg_typeof(average_pace) as pace_type
FROM meet_performance_metrics
WHERE season = '2025'
ORDER BY meet_date;

-- Check athlete metrics  
SELECT 
  name,
  total_races,
  best_time_5k,
  average_pace,
  pg_typeof(best_time_5k) as time_type
FROM athlete_season_metrics
WHERE season = '2025'
LIMIT 10;

-- Check raw race data
SELECT 
  r.name as race_name,
  r.distance,
  r.distance_meters,
  COUNT(res.id) as result_count,
  AVG(res.time) as avg_time
FROM races r
LEFT JOIN results res ON res.race_id = r.id
WHERE r.season = '2025'
GROUP BY r.id, r.name, r.distance, r.distance_meters;
```

### Step 2: Expected Values

**Meet Pace Calculation:**
- Average time: ~1200 seconds (20 minutes for 5K)
- Distance: 3.1 miles
- Pace: 1200 / 3.1 = **387 seconds/mile**
- Formatted: **6:27/mi**

**If database shows:**
- `average_pace = 387` → ✅ Correct (formatter should handle it)
- `average_pace = 121624` → ❌ Wrong calculation
- `average_pace = "6:27"` → ❌ Wrong type (should be number)

### Step 3: Check Calculation Logs

After triggering recalculation, check Railway logs for:

```
Processing X races for athlete [name]
Calculated metrics for [name]: best5k=XXX, totalRaces=X
Found X 5K races out of Y total races
Checking X races for 5K matches. Sample distances: ...
```

### Step 4: Common Issues

**Issue A: Season Type Mismatch**
- Calculation saves: `season: 2025` (number)
- Query uses: `season = '2025'` (string)
- Fix: Ensure consistent string type

**Issue B: Distance Not Matching 5K**
- `distance` field might be "5000m" not "3.1"
- `distance_meters` might be null
- Fix: Check `parseDistanceToMiles` logic

**Issue C: Time Format Wrong**
- Times might be stored as MM:SS string instead of seconds
- Fix: Ensure all times are numeric seconds

**Issue D: Pace Calculation Overflow**
- If `avgTime` is huge, pace will be huge
- Check if times are being summed incorrectly

## Fix Priority

1. **CRITICAL:** Meet pace display (affects user trust)
2. **HIGH:** Athlete metrics calculation (core feature)
3. **MEDIUM:** Race visualization (nice-to-have)
4. **LOW:** Enhanced analytics (advanced features)

## Next Steps

1. Run SQL queries above and paste results
2. Trigger recalculation and check logs
3. Based on findings, implement fixes
4. Test each metric type individually
5. Deploy and verify
