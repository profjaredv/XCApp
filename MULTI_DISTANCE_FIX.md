# Multi-Distance Meet Import Fix

## Problem

When a meet has multiple race distances (e.g., Sunfair with 2-mile and 3-mile races), the current import logic treats them as the same race because it only checks:
- Race name
- Date  
- Team ID

**It does NOT check distance!**

This causes:
1. First distance creates the race (e.g., "Sunfair - 2 Mile")
2. Second distance **overwrites** the first distance
3. All results get lumped into one race
4. Metrics calculations become incorrect

## Root Cause

**File:** `backend/routes/teamsSupabase.js` lines 432-438

```javascript
// ❌ WRONG: Doesn't check distance
const { data: existingRace } = await supabase
    .from('races')
    .select('id')
    .eq('name', raceName)
    .eq('date', parsedDate.format('YYYY-MM-DD'))
    .eq('team_id', team.id)
    .maybeSingle();
```

## Solution

Add distance to the uniqueness check:

```javascript
// ✅ CORRECT: Checks distance too
const { data: existingRace } = await supabase
    .from('races')
    .select('id')
    .eq('name', raceName)
    .eq('date', parsedDate.format('YYYY-MM-DD'))
    .eq('team_id', team.id)
    .eq('distance', distance)  // ADD THIS LINE
    .maybeSingle();
```

## Verification Steps

### 1. Check Current Data

Run this SQL in Supabase to see if Sunfair has multiple distances:

```sql
SELECT 
  r.id,
  r.name,
  r.date,
  r.distance,
  r.distance_meters,
  COUNT(res.id) AS result_count
FROM races r
LEFT JOIN results res ON res.race_id = r.id
WHERE r.name ILIKE '%sunfair%'
  AND r.season = '2025'
GROUP BY r.id, r.name, r.date, r.distance, r.distance_meters
ORDER BY r.date;
```

**Expected:** Should see ONE race (either 2-mile or 3-mile, whichever was imported last)
**After fix:** Should see TWO races (one for 2-mile, one for 3-mile)

### 2. Check Athletic.net Source

Go to: `https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=460&S=2025`

Look at the Sunfair meet - does it show multiple distance columns?

### 3. After Applying Fix

1. Delete existing 2025 data
2. Re-import the season
3. Run the SQL query again
4. Should now see separate races for each distance

## Additional Considerations

### Race Naming

The scraper might be getting race names like:
- "Sunfair Invitational" (for both 2-mile and 3-mile)

Or it might be getting:
- "Sunfair Invitational - 2 Mile"
- "Sunfair Invitational - 3 Mile"

**Check the CSV output** to see what the scraper is actually extracting.

### Database Constraint

Consider adding a unique constraint to prevent duplicates:

```sql
-- Add unique constraint to races table
ALTER TABLE races
ADD CONSTRAINT unique_race_per_distance 
UNIQUE (name, date, team_id, distance);
```

This will prevent accidental duplicates and make the database enforce the rule.

## Implementation

1. **Fix the import logic** (add distance check)
2. **Add database constraint** (optional but recommended)
3. **Re-import 2025 season** to get correct data
4. **Recalculate metrics** to get accurate stats

## Impact

After fixing:
- ✅ Each distance gets its own race record
- ✅ Results are properly separated by distance
- ✅ Metrics calculations will be accurate
- ✅ Distance Analysis tab will show correct breakdown
- ✅ Athletes' race counts will be correct
