# Distance Analysis Fixes

## Issues Fixed ✅

### 1. **Distance Labels** - FIXED
**Before**: "Five K", "One Mile", "Three Mile", "One Point Five Mile"
**After**: "5K", "1 Mile", "3 Mile", "1.5 Mile"

**Solution**: Created `formatDistanceLabel()` function with proper mappings

### 2. **Main Numbers Showing Athlete Count** - FIXED
**Before**: Large numbers (107, 94, 96, 95) were athlete counts
**After**: Large numbers show average time (e.g., "22:23.4")

**Solution**: Changed from `distance.athleteCount` to `formatTime(distance.avgTime)`

### 3. **Label Formatting** - FIXED
**Before**: "Avg: 22:23.4"
**After**: "Avg Pace: 7:12.3/mi"

**Solution**: Updated labels to be more descriptive

---

## What Was Changed

### File: `/web/src/components/analytics/DistanceAnalysisTab.tsx`

#### Change 1: Added Distance Label Formatter
```typescript
const formatDistanceLabel = (key: string): string => {
  const labels: Record<string, string> = {
    'oneMile': '1 Mile',
    'onePointFiveMile': '1.5 Mile',
    'threeMile': '3 Mile',
    'fiveK': '5K'
  };
  return labels[key] || key;
};
```

#### Change 2: Updated Team Distance Data Mapping
```typescript
// Before:
distance: distance.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),

// After:
distance: formatDistanceLabel(distance),
```

#### Change 3: Fixed Card Content Display
```typescript
// Before:
<div className="text-2xl font-bold">{distance.athleteCount}</div>
<p className="text-xs text-muted-foreground">
  Avg: {formatTime(distance.avgTime)}
</p>

// After:
<div className="text-2xl font-bold">{formatTime(distance.avgTime)}</div>
<p className="text-xs text-muted-foreground">
  Avg Pace: {formatTime(distance.avgPace)}/mi
</p>
```

#### Change 4: Fixed Specialists Tab Labels
```typescript
// Before:
{distance.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} Specialists

// After:
{formatDistanceLabel(distance)} Specialists
```

---

## Current Display

### Distance Cards Now Show:
```
5K
22:23.4          ← Average time (main number)
Avg Pace: 7:12.3/mi
Best: 14:59.9
```

### Instead of:
```
Five K
107              ← Athlete count (wrong!)
Avg: 22:23.4
Best: 14:59.9
```

---

## Race Comparison 500 Error

### Status: **NEEDS INVESTIGATION**

**Endpoint**: `GET /api/enhanced-performance/race-comparisons/:athleteId`

**Possible Causes**:
1. `authorizeTeamAccess` middleware failing
2. `req.user.team` not properly populated
3. Athlete not found in database
4. Database query error

**Backend Code** (lines 203-242 in `enhancedPerformanceRoutes.js`):
```javascript
router.get('/race-comparisons/:athleteId', authenticate, authorizeTeamAccess, async (req, res) => {
  const { athleteId } = req.params;
  const teamId = req.user.team?.id || req.user.team_id;
  
  // Get all seasons for this athlete
  const { data: metrics, error } = await supabase
    .from('athlete_season_metrics')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('season', { ascending: true });
  
  res.json({ success: true, data: metrics });
});
```

**Next Steps**:
1. Check Railway logs for specific error message
2. Test endpoint directly with curl/Postman
3. Verify `authorizeTeamAccess` middleware is working
4. Check if athlete exists in `athlete_season_metrics` table

**Test Command**:
```bash
curl -H "Authorization: Bearer <token>" \
  https://xcapp-production.up.railway.app/api/enhanced-performance/race-comparisons/<athlete-id>
```

---

## Testing Checklist

### Distance Analysis Tab ✅
- [x] Labels show "5K" not "Five K"
- [x] Labels show "1 Mile" not "One Mile"
- [x] Labels show "3 Mile" not "Three Mile"
- [x] Labels show "1.5 Mile" not "One Point Five Mile"
- [x] Main numbers show average times (MM:SS.s format)
- [x] Avg Pace shows pace per mile
- [x] Best time displays correctly
- [x] Team Performance chart renders
- [x] Participation chart renders
- [x] Distance Specialists tab shows correct labels

### Race Comparison Tab ❌
- [ ] Select athlete dropdown works
- [ ] Race comparisons load without 500 error
- [ ] Chart displays season-over-season data
- [ ] Improvement indicators show correctly

---

## Deployment

**Commit**: `7e5bc6e`
**Status**: ✅ Pushed to GitHub
**Files Changed**: 1
- `web/src/components/analytics/DistanceAnalysisTab.tsx`

**Breaking Changes**: None
**Migration Required**: No

---

## Before/After Screenshots

### Before:
- "Five K" label
- 107 as main number (athlete count)
- "Avg: 22:23.4" label

### After:
- "5K" label
- "22:23.4" as main number (average time)
- "Avg Pace: 7:12.3/mi" label

---

## Related Issues

- ✅ Fixed: Distance labels formatting
- ✅ Fixed: Main number showing wrong data
- ✅ Fixed: Label clarity (Avg vs Avg Pace)
- ❌ TODO: Race Comparison 500 error
- ❌ TODO: Investigate why numbers might still look wrong (if they do)

---

## Notes

- The `formatTime()` function is imported from `../../utils/formatters`
- Distance normalization happens in the backend (`by_distance` field)
- Athlete count is still available in `distance.athleteCount` but not displayed as main number
- The fix maintains backward compatibility with existing data structure
