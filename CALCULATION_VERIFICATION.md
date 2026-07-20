# Calculation Verification Checklist

## What Should Happen When You Click "Calculate Metrics"

### Step 1: Athlete Metrics Calculation ✅
**Function:** `calculateAthleteMetrics(teamId, season)`

For each athlete:
1. Fetch all race results for that athlete in the season
2. Calculate:
   - `total_races` - Count of races
   - `total_miles` - Sum of all race distances
   - `total_time_seconds` - Sum of all race times
   - `average_pace` - Total time / total miles (sec/mi)
   - `best_pace` - Fastest pace across all races
   - `best_time_5k` - Best 5K time (if any 5K races)
   - `improvement` - Improvement from first to last race
3. Upsert to `athlete_season_metrics` table

**Expected Result:** 110 athletes with metrics

---

### Step 2: Meet Metrics Calculation ✅
**Function:** `calculateMeetMetrics(teamId, season)`

For each race/meet:
1. Fetch all results for that race
2. Calculate overall metrics:
   - `participant_count` - Number of athletes
   - `average_time` - Average finish time
   - `average_pace` - Average pace (sec/mi)
   - `best_time` - Fastest time
3. Calculate gender breakdown (M/F)
4. Store full metrics as JSONB
5. Upsert to `meet_performance_metrics` table

**Expected Result:** 7 meets with metrics

**Current Status:** Fixed `metricsJson` bug, should work after Railway deploys

---

### Step 3: Team Metrics Calculation ✅
**Function:** `calculateTeamMetrics(teamId, season)`

Aggregates from athlete and meet metrics:
1. Sum athlete metrics:
   - `total_athletes` - Count of athletes (110)
   - `total_races` - Sum of all athlete.total_races (~630)
   - `total_miles` - Sum of all athlete.total_miles (~1610)
   - `average_pace` - Total time / total miles
2. Calculate gender counts (M/F)
3. Calculate improvement (first meet → last meet)
4. Upsert to `team_season_metrics` table

**Expected Result:** 1 team metrics record with:
- `total_athletes`: 110
- `total_races`: ~630
- `total_miles`: ~1610
- `average_pace`: ~440 sec/mi (7:20/mi)
- `meet_count`: 7

---

## Current Issues (Being Fixed)

### ✅ Fixed - Deployed
1. **Upsert conflicts** - Added `onConflict` to all upserts
2. **Distance bug** - Fixed `distance_meters` calculation
3. **Season type** - Changed to integer

### ✅ Fixed - Waiting for Railway Deploy
4. **metricsJson undefined** - Added JSON serialization
5. **camelCase response** - Transform snake_case → camelCase for UI

### ⏳ Pending - Not Yet Committed
6. **Analytics display** - Show `total_races` instead of `meets.length`

---

## Verification Steps

After Railway deploys (check logs for new deployment):

1. **Go to Data Management**
2. **Click "Calculate Metrics"**
3. **Wait for completion** (~30 seconds)
4. **Check the completion screen shows:**
   - ✅ Athletes: 110
   - ✅ Races: 630
   - ✅ Total Miles: 1610.3

5. **Go to Analytics Overview**
6. **Verify displays:**
   - ✅ Total Races: 630 (not 7)
   - ✅ Total Athletes: 110
   - ✅ Avg Mile Pace: ~7:20/mi
   - ✅ Total Miles: 1610.3

---

## If Calculation Still Fails

Check Railway logs for errors:
1. Look for "Error calculating meet metrics"
2. Look for "Error calculating team metrics"
3. Check for any database constraint violations
4. Verify all 3 tables have data:
   - `athlete_season_metrics` (should have 110 rows)
   - `meet_performance_metrics` (should have 7 rows)
   - `team_season_metrics` (should have 1 row)

---

## Next Phase: Enhanced Metrics

Once basic calculations work, implement:
- Gender breakdown (men/women stats)
- Grade breakdown (9/10/11/12 stats)
- Distance breakdown (1mi/1.5mi/3mi/5K stats)
- Team depth (top 5/7 spread)
- Pack running analysis

See `UNIFIED_METRICS_PLAN.md` for details.
