# Athlete Modal Debug Guide

## Current Issue
The athlete modal shows no data because the database tables are empty.

## Root Cause
The `/teams/scrape` endpoint was using MongoDB models until the fix I just deployed. All previous imports sent data to MongoDB (which doesn't exist) instead of Supabase.

## Data Flow for Athlete Modal

### 1. User clicks athlete → Modal opens
- **Component**: `AthleteDetailModal.tsx`
- **Triggered by**: Clicking an athlete in the Athletes tab

### 2. Frontend fetches athlete data
- **Hook**: `useAthleteAllSeasons(athleteId)`
- **API Call**: `GET /api/performance/athlete/:athleteId/all-seasons`

### 3. Backend queries database
```javascript
// File: backend/routes/performanceRoutes.js (line 445-456)
const { data: metrics, error: metricsError } = await supabase
  .from('athlete_season_metrics')
  .select('*')
  .eq('athlete_id', athleteId)
  .order('season', { ascending: true });
```

### 4. Backend enriches with race data
```javascript
// File: backend/routes/performanceRoutes.js (line 464)
const races = await calculationService.getAthleteRacesSeasonOnly(athleteId, season);
```

This queries:
- `results` table (athlete's race results)
- `races` table (race details via join)

### 5. Frontend displays in modal
- **Career Summary**: Total races, miles, pace, PR, SB
- **Season Breakdown**: Per-season stats with charts
- **All Races**: Table of every race the athlete ran

## What's Missing Right Now

### Database Tables (Currently Empty)
1. **`athletes`** - No athlete records
2. **`races`** - No race records  
3. **`results`** - No result records
4. **`athlete_season_metrics`** - No calculated metrics

### Why They're Empty
Before my fix (deployed 10 minutes ago), the scraper was calling:
```javascript
// OLD CODE (MongoDB)
await Athlete.findOneAndUpdate(...)  // ❌ Sent to MongoDB
await Race.findOneAndUpdate(...)     // ❌ Sent to MongoDB
await Result.findOneAndUpdate(...)   // ❌ Sent to MongoDB
```

Now it calls:
```javascript
// NEW CODE (Supabase) 
await supabase.from('athletes').upsert(...)  // ✅ Saves to Supabase
await supabase.from('races').upsert(...)     // ✅ Saves to Supabase
await supabase.from('results').upsert(...)   // ✅ Saves to Supabase
```

## How to Fix (Step-by-Step)

### Step 1: Wait for Railway Deployment
Check Railway dashboard - the new code should be deploying now.

### Step 2: Re-Import Your Data
1. Go to **Data Management** page
2. Click **"Import Season Data"**
3. Select **2025** season
4. Click **Import**

### Step 3: Watch the Logs
In Railway logs, you should see:
```
✅ Import complete. processed=637, skippedMissing=0, skippedDate=0
📊 Total CSV records received: 637
✓ Successfully processed: 637
🔄 Starting automatic analytics calculation for team [teamId], season 2025
✅ Analytics calculated for season 2025
```

### Step 4: Verify Database
Open Supabase dashboard and check:

**`results` table:**
- Should have ~637 rows
- Columns: `athlete_id`, `race_id`, `time`, `grade`, `team_id`

**`athletes` table:**
- Should have ~182 rows (your team roster)
- Columns: `id`, `name`, `team_id`, `gender`, `grade`, `graduation_year`

**`races` table:**
- Should have ~7 rows (your meets)
- Columns: `id`, `name`, `date`, `team_id`, `distance`, `distance_meters`, `season`

**`athlete_season_metrics` table:**
- Should have ~182 rows (one per athlete for 2025 season)
- Columns: `athlete_id`, `season`, `best_time_5k`, `total_races`, `total_miles`, etc.

### Step 5: Test the Modal
1. Go to **Analytics** page
2. Click **Athletes** tab
3. Click on any athlete
4. Modal should now show:
   - ✅ Career summary with stats
   - ✅ Season breakdown with charts
   - ✅ All races table with data

## If Modal Still Shows No Data

### Debug Checklist

**1. Check if data was imported:**
```sql
-- Run in Supabase SQL Editor
SELECT COUNT(*) FROM results;
SELECT COUNT(*) FROM athletes;
SELECT COUNT(*) FROM races;
```

**2. Check if metrics were calculated:**
```sql
SELECT COUNT(*) FROM athlete_season_metrics WHERE season = '2025';
```

**3. Check browser console:**
- Open DevTools → Console
- Look for API errors
- Check the response from `/api/performance/athlete/:athleteId/all-seasons`

**4. Check Railway logs:**
- Look for errors during import
- Look for errors during calculation
- Search for "Error upserting"

## Common Issues

### Issue: "No metrics found for the specified athlete"
**Cause**: `athlete_season_metrics` table is empty  
**Fix**: Metrics weren't calculated. Manually trigger:
```
POST /api/performance/recalculate
Body: { "teamId": "your-team-id", "season": 2025 }
```

### Issue: Modal shows 0 races
**Cause**: `results` table is empty or not linked to races  
**Fix**: Check if results have valid `race_id` foreign keys

### Issue: Athletes show in list but modal is empty
**Cause**: Athletes exist but have no results  
**Fix**: Re-import the season data

## Next Steps After Data Import Works

Once you confirm data is in the database and the modal works:

1. **Fix distance matching** - Currently looks for exactly "3.1 miles", misses "5K" races
2. **Fix best times** - Improve the logic that finds PR/SB times
3. **Test other features** - Verify meets page, team stats, etc.

## Quick Test Query

Run this in Supabase SQL Editor to see what an athlete's data looks like:

```sql
-- Get a sample athlete with their results
SELECT 
  a.name,
  a.gender,
  a.grade,
  COUNT(r.id) as race_count,
  MIN(r.time) as best_time
FROM athletes a
LEFT JOIN results r ON r.athlete_id = a.id
LEFT JOIN races ra ON ra.id = r.race_id
WHERE ra.season = '2025'
GROUP BY a.id, a.name, a.gender, a.grade
ORDER BY race_count DESC
LIMIT 5;
```

This will show you the top 5 athletes by race count and their best times.
