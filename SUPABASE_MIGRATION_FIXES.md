# Supabase Migration Fixes - Summary

## Issues Fixed

### 1. **Distance Meters Conversion** ✅
**Problem**: `distance_meters` was stored in miles instead of meters, causing pace calculations to be 1000x too large (13,000 min/mile instead of 7 min/mile).

**Fix**: 
- Created migration script `/backend/run_migration.js` to convert:
  - 1 mile → 1609 meters
  - 1.5 miles → 2414 meters  
  - 2 miles → 3219 meters
  - 3 miles → 4828 meters
  - 5K already correct at 5000 meters

**Files Changed**:
- `/supabase_migrations/06_fix_distance_meters.sql`
- `/backend/run_migration.js`

---

### 2. **Season Type Mismatch** ✅
**Problem**: Season stored as `number` (2025) in database but queries used `string` ('2025'), causing all athlete race lookups to fail.

**Fix**: Added type conversion in calculation service to handle both string and number seasons.

**Files Changed**:
- `/backend/services/performance/calculationServiceSupabase.js` (line 88-91)

---

### 3. **Athletes Endpoint - Season Filter** ✅
**Problem**: Used `String(seasonYear)` when querying races, but season is stored as number.

**Fix**: Changed `.eq('season', String(seasonYear))` to `.eq('season', seasonYear)`

**Files Changed**:
- `/backend/routes/athletes.js` (line 45)

---

### 4. **Athlete Detail Endpoint - Join Filter** ✅
**Problem**: Used `.eq('races.season', String(seasonYear))` which doesn't work with Supabase joins.

**Fix**: Changed to two-step query:
1. Get all race IDs for the season
2. Filter results by those race IDs using `.in('race_id', raceIds)`

**Files Changed**:
- `/backend/routes/athletes.js` (lines 133-155)

---

### 5. **Meets Endpoint - Season Filter** ✅
**Problem**: Same as #3 - used `String(seasonYear)` instead of number.

**Fix**: Changed `.eq('season', String(seasonYear))` to `.eq('season', seasonYear)`

**Files Changed**:
- `/backend/routes/meets.js` (line 24)

---

### 6. **Meet Detail Endpoint - Missing Athlete Data** ✅
**Problem**: Results didn't include athlete information needed for "Analyze Meet" feature.

**Fix**: Added athlete join to results query and sorted by time:
```javascript
.select(`
  *,
  athlete:athletes(id, name, gender, grade)
`)
.order('time', { ascending: true })
```

**Files Changed**:
- `/backend/routes/meets.js` (lines 66-73)

---

## Remaining Issues to Investigate

### 1. **Athlete Modal - Missing Race List**
**Symptom**: When clicking on an athlete, their race history doesn't show up.

**Possible Causes**:
- Frontend not correctly mapping the `results` array from athlete detail endpoint
- Results need to be sorted by date (currently sorted by race_id)
- Missing `pace` calculation in results

**Next Steps**:
- Check frontend athlete modal component
- Verify result structure matches expected interface
- Add pace calculation to results if missing

---

### 2. **Charts Not Showing Data**
**Symptom**: Performance charts are empty.

**Possible Causes**:
- Data transformation mismatch between API and frontend
- Missing required fields in athlete/meet metrics
- Chart component expecting different data structure

**Next Steps**:
- Check console for errors in browser
- Verify data structure in analytics overview endpoint
- Compare with MongoDB data structure that worked before

---

### 3. **Analyze Meet Feature**
**Status**: Should be working now after fix #6, but needs testing.

**What it does**:
- Shows detailed statistics for a meet
- Calculates IQR (interquartile range) for performance distribution
- Shows top 7/15 runners by gender
- Displays grade cohort analysis
- Shows scatter plot of performance

**Dependencies**:
- Needs `results` array with athlete data (now fixed)
- Needs athlete lookup map (should work from overview data)

---

## How to Deploy Fixes

### 1. **Run Distance Meters Migration** (One-time)
```bash
SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
node backend/run_migration.js
```

### 2. **Recalculate Analytics** (After migration)
```bash
SUPABASE_URL=https://nxlatotemxoryjsuouak.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
node backend/recalculate_analytics.js
```

### 3. **Deploy Backend Changes**
```bash
git add backend/routes/athletes.js backend/routes/meets.js backend/services/performance/calculationServiceSupabase.js
git commit -m "Fix season type mismatches and add athlete data to meet results"
git push
```

### 4. **Verify in Production**
- Check athlete list loads correctly
- Click on athlete → verify races show up
- Check meets list loads
- Click "Analyze Meet" → verify statistics modal works
- Check charts render with data

---

## Database Schema Notes

### Season Column Type
- **Current**: `INTEGER` (e.g., 2025)
- **Queries**: Must use `seasonYear` (number), not `String(seasonYear)`
- **Why**: Supabase/PostgreSQL strict type matching

### Distance Meters Column
- **Current**: `INTEGER` in meters
- **Values**: 1609, 2414, 3219, 4828, 5000
- **Calculation**: `pace = (time_seconds / distance_meters) * 1609.34`

### Results Structure
- **athlete_id**: UUID reference to athletes table
- **race_id**: UUID reference to races table
- **time**: INTEGER (seconds)
- **place**: INTEGER (overall placement)
- **team_place**: INTEGER (team placement)
- **pace**: DECIMAL (calculated, seconds per mile)

---

## Testing Checklist

- [ ] Athletes list shows all 110 athletes
- [ ] Each athlete shows correct race count
- [ ] Clicking athlete opens modal with race history
- [ ] Race history shows times, dates, paces
- [ ] Meets list shows all 8 meets
- [ ] Each meet shows correct runner count and avg pace
- [ ] "Analyze Meet" opens statistics modal
- [ ] Statistics modal shows IQR, top performers, cohorts
- [ ] Charts render (pace trend, distribution, etc.)
- [ ] Season pace trend shows reasonable values (6-8 min/mile)
- [ ] No console errors in browser
