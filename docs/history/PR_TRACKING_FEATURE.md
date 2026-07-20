# PR Tracking Feature

## Overview

Added comprehensive Personal Record (PR) tracking system that identifies and highlights athlete PRs across all seasons and distances.

## Features

### 1. **Historical PR Tracking**
- Tracks PRs chronologically - once set, they remain marked as PRs
- Separate tracking for each distance (5K, 3K, 2 Mile, etc.)
- Normalizes distances within 50m to handle slight variations

### 2. **Visual Indicators**
- **Yellow badge "PR"**: Overall personal record across all seasons
- **Blue badge "SB"**: Season best (best in current season, but not overall PR)
- **Bold text**: PR times are bolded for emphasis
- **Colored row backgrounds**: Subtle background colors for PRs

### 3. **Distance Normalization**
Common XC distances are normalized:
- 1600m → Mile
- 3000m → 3K
- 3200m → 2 Mile
- 5000m → 5K
- 8000m → 8K

Races within 50m of these distances are grouped together.

## Implementation

### Core Utility: `/web/src/utils/prTracking.ts`

```typescript
// Calculate PRs across all races
calculatePRs(races) → Set<raceId>

// Calculate season-specific PRs
calculateSeasonPRs(races, season) → Set<raceId>

// Enrich races with PR flags
enrichRacesWithPRs(races) → races with isPR and isSeasonPR flags

// Get styling for PR badges
getPRBadgeStyle(isPR, isSeasonPR) → { className, label }
```

### Integration Points

1. **AthleteDetailModal.tsx**
   - "All Races" tab shows PR badges
   - PRs are calculated when modal opens
   - Works across all seasons

2. **Future Integration Points** (TODO):
   - Meet results tables
   - Athlete profile pages
   - Season overview charts
   - Team leaderboards

## How It Works

### Algorithm

1. **Sort races chronologically** (oldest first)
2. **Track best time for each distance** in a Map
3. **Mark as PR** if:
   - First race at that distance, OR
   - Faster than previous best at that distance
4. **Mark as Season Best** if:
   - Best in current season for that distance
   - But NOT an overall PR

### Example

```
Athlete runs 5K races:
- Sept 1, 2024: 18:30 → PR (first 5K)
- Sept 15, 2024: 18:15 → PR (faster than 18:30)
- Oct 1, 2024: 18:45 → Neither (slower)
- Sept 1, 2025: 18:20 → SB (best in 2025, but not faster than 18:15)
- Sept 15, 2025: 18:10 → PR (faster than all-time best)
```

## Visual Design

### PR Badge (Yellow)
```html
<span class="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 font-bold">
  PR
</span>
```

### Season Best Badge (Blue)
```html
<span class="bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 font-semibold">
  SB
</span>
```

### Row Styling
- PR rows: `bg-yellow-100 dark:bg-yellow-900`
- SB rows: `bg-blue-100 dark:bg-blue-900`
- Time column: Bold for PRs

## Testing

### Test Cases

1. **First race at distance** → Should be PR
2. **Faster time** → Should be PR
3. **Slower time** → Should not be PR
4. **Season best but not PR** → Should be SB
5. **Multiple distances** → PRs tracked separately
6. **Distance variations** (e.g., 4990m vs 5000m) → Should be grouped

### Manual Testing

1. Open athlete modal
2. Go to "All Races" tab
3. Verify:
   - First race at each distance has PR badge
   - Fastest times have PR badges
   - Season bests (not overall PRs) have SB badges
   - Times are bolded for PRs
   - Badges appear next to meet name

## Future Enhancements

### Short Term
- [ ] Add PR tracking to meet results tables
- [ ] Show PR count in athlete cards
- [ ] Add "PRs This Season" stat to overview

### Medium Term
- [ ] PR progression chart (show PR improvements over time)
- [ ] PR comparison between athletes
- [ ] Team PR leaderboard by distance

### Long Term
- [ ] PR notifications when athlete sets new PR
- [ ] PR predictions based on training data
- [ ] Historical PR timeline visualization

## Performance Considerations

- **Calculation**: O(n log n) for sorting + O(n) for PR detection
- **Caching**: PRs are calculated once per modal open
- **Memory**: Minimal - only stores Set of PR race IDs
- **Re-calculation**: Only when race data changes

## Edge Cases Handled

1. **Missing distance data**: Skips PR calculation
2. **Duplicate races**: Deduplication before PR calculation
3. **Invalid times**: Filtered out (time <= 0)
4. **Missing dates**: Sorted by index if date unavailable
5. **Season transitions**: Correctly handles multi-season athletes

## Database Schema

No database changes required! PR calculation is done client-side from existing race data.

### Data Requirements

Each race needs:
- `time` (seconds)
- `distanceMeters` (meters)
- `date` (ISO string)
- `meetName` (string)
- `season` (number, optional for SB tracking)
- `_id` (optional, for unique identification)

## Deployment

**Status**: ✅ Deployed (commit `e1de09c`)

**Files Changed**:
- `web/src/utils/prTracking.ts` (new)
- `web/src/components/analytics/AthleteDetailModal.tsx` (modified)

**Breaking Changes**: None

**Migration Required**: No

## Usage Example

```typescript
import { enrichRacesWithPRs, getPRBadgeStyle } from '@/utils/prTracking';

// Enrich races with PR information
const racesWithPRs = enrichRacesWithPRs(athleteRaces);

// Display in table
racesWithPRs.map(race => {
  const badge = getPRBadgeStyle(race.isPR, race.isSeasonPR);
  return (
    <tr className={badge.className}>
      <td>
        {race.meetName}
        {race.isPR && <span className="badge-pr">PR</span>}
        {race.isSeasonPR && <span className="badge-sb">SB</span>}
      </td>
      <td className={race.isPR ? 'font-bold' : ''}>
        {formatTime(race.time)}
      </td>
    </tr>
  );
});
```

## Related Issues

- Fixes: Season Breakdown not showing data
- Fixes: Analyze Meet not appearing (converted to modal)
- Enhances: Athlete race history visibility
- Adds: Historical PR tracking across all seasons
