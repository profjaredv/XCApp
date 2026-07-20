# Comprehensive Metrics Audit & Fix Plan

## Overview
Systematic review and fix of all calculation logic in LeadPack XC analytics system.

---

## Phase 1: Meet Metrics (IN PROGRESS)

### Files to Audit:
- `/backend/services/performance/calculationServiceSupabase.js` - `calculateMeetPerformance()`
- `/backend/routes/analytics.js` - Meet data transformation
- `/web/src/components/analytics/MeetsTab.tsx` - Display logic

### Calculations to Verify:
- [ ] Average pace (seconds/mile) ← **CRITICAL BUG**
- [ ] Average time (seconds)
- [ ] Best time (seconds)
- [ ] Team score (sum of top 7)
- [ ] Participant counts (total, male, female)

### Known Issues:
- ❌ Pace showing as `121624:47/mi` instead of `6:27/mi`
- Possible causes:
  - Database storing wrong value
  - Type mismatch (string vs number)
  - Calculation error (wrong formula)
  - Display formatter not being called

### Fix Steps:
1. Query database to see actual stored values
2. Add logging to `calculateMeetPerformance`
3. Verify `calculatePace` returns correct value
4. Ensure `formatPace` is being called
5. Test with sample data

---

## Phase 2: Athlete Metrics

### Files to Audit:
- `/backend/services/performance/calculationServiceSupabase.js` - `processAthleteMetrics()`
- `/backend/services/performance/calculationServiceSupabase.js` - `calculateAthleteRaceMetrics()`
- `/backend/routes/analytics.js` - Athlete data transformation
- `/web/src/components/analytics/AthletesTab.tsx` - Display logic

### Calculations to Verify:
- [ ] Best 5K time (SB 5K)
- [ ] PR 5K time
- [ ] Total races count
- [ ] Average pace
- [ ] Total miles
- [ ] Improvement percentage
- [ ] Best pace

### Known Issues:
- ❌ All athletes showing `SB 5K: 0:00.0`, `PR 5K: 0:00.0`, `Races: 0`
- ✅ Average pace shows correct values (e.g., `7:18/mi`)

### Possible Causes:
- 5K distance matching logic failing
- Race data not being fetched
- Season type mismatch
- Calculation not running

### Fix Steps:
1. Add logging to trace race fetching
2. Verify `getAthleteRacesSeasonOnly` returns data
3. Check 5K matching logic in `calculateAthleteRaceMetrics`
4. Verify distance values in database
5. Test calculation with known data

---

## Phase 3: Race Visualization

### Files to Audit:
- `/backend/routes/analytics.js` - `GET /races/:raceId`
- `/web/src/components/analytics/RaceVisualization.tsx`
- Race result fetching logic

### Calculations to Verify:
- [ ] Race results fetching
- [ ] Time distribution for beeswarm
- [ ] Place/rank calculation
- [ ] PR detection

### Known Issues:
- ❌ Beeswarm plot empty
- ❌ Full Results table empty

### Fix Steps:
1. Check if race detail endpoint is being called
2. Verify results are being fetched from database
3. Check data transformation
4. Test visualization component with mock data

---

## Phase 4: Team Overview Metrics

### Files to Audit:
- `/backend/services/performance/calculationServiceSupabase.js` - `calculateTeamMetrics()`
- `/backend/routes/analytics.js` - Team overview section
- `/web/src/components/analytics/OverviewTab.tsx`

### Calculations to Verify:
- [ ] Total meets
- [ ] Total athletes
- [ ] Average athletes per race
- [ ] Total miles run
- [ ] Average mile pace
- [ ] Total PRs
- [ ] Top 10 finishes

### Fix Steps:
1. Verify team metrics calculation
2. Check aggregation logic
3. Test with known data

---

## Phase 5: Distance Analysis

### Files to Audit:
- `/backend/routes/enhancedPerformanceRoutes.js` - Distance analysis endpoint
- `/web/src/components/analytics/DistanceAnalysisTab.tsx`

### Calculations to Verify:
- [ ] Performance by distance
- [ ] Distance-specific PRs
- [ ] Pace trends by distance
- [ ] Distance distribution

### Fix Steps:
1. Verify distance grouping logic
2. Check performance calculations per distance
3. Test visualization

---

## Phase 6: Race Comparison

### Files to Audit:
- `/backend/routes/enhancedPerformanceRoutes.js` - Race comparison endpoint
- `/web/src/components/analytics/RaceComparisonTab.tsx`

### Calculations to Verify:
- [ ] Head-to-head comparisons
- [ ] Performance deltas
- [ ] Relative rankings

### Fix Steps:
1. Verify comparison logic
2. Check data fetching
3. Test with multiple races

---

## Phase 7: Enhanced Analytics

### Files to Audit:
- `/backend/services/performance/enhancedCalculationService.js` (if exists)
- `/backend/routes/enhancedPerformanceRoutes.js`
- `/web/src/components/analytics/EnhancedOverviewTab.tsx`

### Calculations to Verify:
- [ ] Advanced metrics
- [ ] Trend analysis
- [ ] Predictive analytics

### Fix Steps:
1. Verify enhanced calculations exist
2. Check if they're being called
3. Test accuracy

---

## Testing Checklist

After each phase:
- [ ] Unit test calculations with known inputs
- [ ] Verify database values are correct
- [ ] Check API responses
- [ ] Test frontend display
- [ ] Verify formatting
- [ ] Cross-check with manual calculations

---

## Success Criteria

### Phase 1 (Meet Metrics):
- ✅ Pace shows as `6:27/mi` not `121624:47/mi`
- ✅ All meet cards show correct values
- ✅ Values match manual calculations

### Phase 2 (Athlete Metrics):
- ✅ Athletes show actual race counts
- ✅ Best 5K times are populated
- ✅ PR times are accurate
- ✅ Average pace is correct

### Phase 3 (Race Visualization):
- ✅ Beeswarm plot renders with data
- ✅ Full results table populated
- ✅ Times and places are correct

### Phases 4-7:
- ✅ All metrics calculate correctly
- ✅ No zero or null values (unless legitimate)
- ✅ Values are reasonable (no outliers)
- ✅ Formatting is consistent

---

## Current Status

**Last Updated:** 2025-10-14 11:54pm

**Completed:**
- ✅ Results Grid working
- ✅ Data import working
- ✅ Seasons endpoint working

**In Progress:**
- 🔄 Meet pace calculation diagnosis
- 🔄 Athlete metrics calculation

**Blocked:**
- ⏸️ Need database query results
- ⏸️ Need recalculation logs

**Next Action:**
Run diagnostic SQL queries and trigger recalculation to see logs.
