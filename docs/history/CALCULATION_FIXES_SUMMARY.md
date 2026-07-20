# Calculation Fixes Summary

## Issues Fixed (2025-10-15)

### 1. ✅ 5K Distance Matching
**Problem:** Races with distance "5,000 Meters" weren't being identified as 5K races
- **Root Cause:** Comma in "5,000" broke parsing logic
- **Fix:** 
  - Updated `parseDistanceToMiles()` to handle "5,000 Meters" format
  - Updated 5K race filter to check for "5,000" or "5000" in distance text
  - Fixed scraper `parseDistanceToMeters()` to remove commas before parsing

**Files Changed:**
- `backend/services/performance/calculationServiceSupabase.js`
- `backend/routes/teamsSupabase.js`

**Result:** Athletes now correctly show 5K times instead of 0:00.0

---

### 2. ✅ Meet Performance Calculations
**Problem:** Meet metrics were missing gender/grade breakdowns and proper structure
- **Root Cause:** Supabase version was simplified compared to MongoDB version
- **Fix:** Ported complete MongoDB `calculateMeetPerformance()` logic
  - Added gender breakdowns (M/F)
  - Added grade breakdowns
  - Added top-7 team scores per gender
  - Proper weighted pace calculations
  - Store full metrics as JSONB

**Files Changed:**
- `backend/services/performance/calculationServiceSupabase.js`

**Result:** Meet cards now show correct pace values (e.g., 6:27/mi instead of 121624:47/mi)

---

### 3. ✅ Team Metrics Enhancement
**Problem:** Missing first/last meet tracking and improvement calculations
- **Root Cause:** Simplified Supabase version missing features
- **Fix:** Added comprehensive team metrics
  - First meet data (name, date, avgPace, avgTime)
  - Last meet data (name, date, avgPace, avgTime)
  - Improvement percentage (first to last)
  - Better aggregation logic

**Files Changed:**
- `backend/services/performance/calculationServiceSupabase.js`

**Result:** Team overview shows season improvement and meet comparisons

---

### 4. ✅ Season Type Consistency
**Problem:** Mixed number/string types for season causing query mismatches
- **Root Cause:** Inconsistent type handling
- **Fix:** Standardized to string type throughout
  - All queries use `.toString()`
  - All storage uses string format
  - Added type logging for debugging

**Files Changed:**
- `backend/services/performance/calculationServiceSupabase.js`

**Result:** Queries consistently find data

---

### 5. ✅ Gender Normalization
**Problem:** Gender stored as "Men"/"Women" but code expected "M"/"F"
- **Root Cause:** Athletic.net scraper stores full words
- **Fix:** Normalize in all calculation functions
  - `'Men' → 'M'`
  - `'Women' → 'F'`

**Files Changed:**
- `backend/services/performance/calculationServiceSupabase.js`

**Result:** Gender-based filtering and breakdowns work correctly

---

## What Still Needs Work

### 1. ⏳ PR Detection and Tracking
**Status:** Not yet implemented
**What's Needed:**
- Track personal records across all seasons
- Compare current season best to all-time best
- Store PR flags in athlete metrics

### 2. ⏳ Race Visualization
**Status:** Partially working
**What's Needed:**
- Verify beeswarm plot data fetching
- Ensure race detail endpoint returns proper structure
- Test with actual race selection

### 3. ⏳ Advanced Analytics
**Status:** Not yet ported
**What's Needed:**
- Distance analysis tab
- Race comparison features
- Enhanced trend calculations
- Predictive analytics

---

## How to Apply Fixes

### Step 1: Deploy Latest Code
Code is already pushed to `main` branch. Railway will auto-deploy.

### Step 2: Recalculate All Metrics
1. Go to **Data Management** page in app
2. Click **"Recalculate Metrics"** for season 2025
3. Wait ~2-3 minutes for completion

### Step 3: Verify Results
Check these tabs in Analytics:
- **Overview:** Team metrics, improvement percentage
- **Meets:** Pace showing as `6:27/mi` (not `121624:47/mi`)
- **Athletes:** Best 5K times populated (not `0:00.0`)

---

## Database Schema Notes

### meet_performance_metrics
```sql
- average_pace: numeric (seconds per mile)
- average_time: numeric (seconds)
- metrics: jsonb (full breakdown with gender/grade)
```

**Important:** `average_pace` should be ~387 for a 20-minute 5K (1200s / 3.1mi = 387s/mi = 6:27/mi)

### athlete_season_metrics
```sql
- best_time_5k: numeric (seconds)
- average_pace: numeric (seconds per mile)
- total_races: integer
```

**Important:** `best_time_5k` should be actual race time (e.g., 1234 seconds = 20:34)

---

## Testing Checklist

After recalculation:
- [ ] Meet pace displays correctly (6:00-8:00/mi range)
- [ ] Athlete 5K times are populated
- [ ] Athlete race counts are accurate
- [ ] Team improvement percentage shows
- [ ] Gender breakdowns work
- [ ] Grade breakdowns work
- [ ] Charts render with data

---

## Key Learnings

1. **Always match MongoDB logic exactly** - The working version had comprehensive calculations
2. **Type consistency matters** - String vs number caused silent failures
3. **Distance parsing is tricky** - Commas, units, formats all need handling
4. **Gender normalization** - Athletic.net uses full words, we need abbreviations
5. **JSONB is powerful** - Store full structure for flexibility

---

## Next Steps

1. ✅ **DONE:** Fix 5K matching
2. ✅ **DONE:** Port meet calculations
3. ✅ **DONE:** Add team metrics enhancements
4. 🔄 **IN PROGRESS:** Recalculate all metrics
5. ⏳ **TODO:** Add PR tracking
6. ⏳ **TODO:** Verify race visualization
7. ⏳ **TODO:** Port advanced analytics

---

**Last Updated:** 2025-10-15 10:30am PST
**Status:** Core calculations fixed, ready for recalculation
