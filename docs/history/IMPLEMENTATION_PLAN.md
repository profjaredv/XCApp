# Unified Metrics Implementation Plan

## Current Status

### ✅ Working (Basic Metrics)
1. **Athlete Metrics** - Calculates per-athlete stats
2. **Meet Metrics** - Calculates per-meet stats  
3. **Team Metrics** - Basic aggregations

### ❌ Missing (Enhanced Metrics)
1. **Gender Breakdown** - Men vs Women detailed stats
2. **Grade Breakdown** - 9th, 10th, 11th, 12th grade stats
3. **Distance Breakdown** - Performance by race distance
4. **Team Depth** - Top 5/7 spread analysis
5. **Pack Running** - Gap analysis between runners

---

## Implementation Steps

### Phase 1: Database Schema ✅
**File:** `supabase_migrations/07_add_enhanced_metrics_columns.sql`

Add JSONB columns to `team_season_metrics`:
- `by_gender` - Gender breakdown
- `by_grade` - Grade breakdown
- `by_distance` - Distance breakdown
- `team_depth` - Team depth metrics
- `pack_running` - Pack running analysis

**Action:** Run migration via Supabase dashboard SQL editor

---

### Phase 2: Enhanced Calculation Methods
**File:** `backend/services/performance/calculationServiceSupabase.js`

Add these methods to the class:

#### 2.1 `calculateGenderBreakdown(athleteMetrics)`
```javascript
/**
 * Calculate gender-specific metrics from athlete data
 * @param {Array} athleteMetrics - Array of athlete_season_metrics records
 * @returns {Object} { men: {...}, women: {...} }
 */
calculateGenderBreakdown(athleteMetrics) {
  const maleAthletes = athleteMetrics.filter(a => a.gender === 'M');
  const femaleAthletes = athleteMetrics.filter(a => a.gender === 'F');
  
  return {
    men: this._calculateGroupStats(maleAthletes),
    women: this._calculateGroupStats(femaleAthletes)
  };
}
```

#### 2.2 `calculateGradeBreakdown(athleteMetrics)`
```javascript
/**
 * Calculate grade-specific metrics
 * @param {Array} athleteMetrics - Array of athlete_season_metrics records
 * @returns {Object} { grade9: {...}, grade10: {...}, grade11: {...}, grade12: {...} }
 */
calculateGradeBreakdown(athleteMetrics) {
  const byGrade = {
    grade9: athleteMetrics.filter(a => a.grade === '9'),
    grade10: athleteMetrics.filter(a => a.grade === '10'),
    grade11: athleteMetrics.filter(a => a.grade === '11'),
    grade12: athleteMetrics.filter(a => a.grade === '12')
  };
  
  return {
    grade9: this._calculateGroupStats(byGrade.grade9),
    grade10: this._calculateGroupStats(byGrade.grade10),
    grade11: this._calculateGroupStats(byGrade.grade11),
    grade12: this._calculateGroupStats(byGrade.grade12)
  };
}
```

#### 2.3 `calculateDistanceBreakdown(teamId, season)`
```javascript
/**
 * Calculate distance-specific performance metrics
 * @param {String} teamId - Team ID
 * @param {Number} season - Season year
 * @returns {Object} { oneMile: {...}, onePointFiveMile: {...}, threeMile: {...}, fiveK: {...} }
 */
async calculateDistanceBreakdown(teamId, season) {
  // Fetch all results grouped by distance
  const { data: results } = await supabase
    .from('results')
    .select(`
      *,
      race:races!inner(distance_meters, team_id, season)
    `)
    .eq('race.team_id', teamId)
    .eq('race.season', season);
  
  // Group by distance and calculate stats
  const byDistance = {
    oneMile: this._filterAndCalculateDistance(results, 1609, 1609),      // Exactly 1 mile
    onePointFiveMile: this._filterAndCalculateDistance(results, 2400, 2500), // ~1.5 miles
    threeMile: this._filterAndCalculateDistance(results, 4800, 4900),    // ~3 miles
    fiveK: this._filterAndCalculateDistance(results, 4900, 5100)         // ~5K
  };
  
  return byDistance;
}
```

#### 2.4 `calculateTeamDepth(meetMetrics)`
```javascript
/**
 * Calculate team depth metrics (top 5/7 spread)
 * @param {Array} meetMetrics - Array of meet_performance_metrics records
 * @returns {Object} { top5Spread, top7Spread, depthScore, varsityAvgTime, jvAvgTime }
 */
async calculateTeamDepth(teamId, season) {
  // For each meet, get top 7 finishers and calculate spread
  const { data: meets } = await supabase
    .from('races')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('season', season);
  
  let totalTop5Spread = 0;
  let totalTop7Spread = 0;
  let meetCount = 0;
  
  for (const meet of meets) {
    const { data: results } = await supabase
      .from('results')
      .select('time')
      .eq('race_id', meet.id)
      .order('time', { ascending: true })
      .limit(7);
    
    if (results && results.length >= 5) {
      const top5Spread = results[4].time - results[0].time;
      totalTop5Spread += top5Spread;
      
      if (results.length >= 7) {
        const top7Spread = results[6].time - results[0].time;
        totalTop7Spread += top7Spread;
      }
      
      meetCount++;
    }
  }
  
  return {
    top5Spread: meetCount > 0 ? totalTop5Spread / meetCount : 0,
    top7Spread: meetCount > 0 ? totalTop7Spread / meetCount : 0,
    depthScore: meetCount > 0 ? (totalTop7Spread / meetCount) / 7 : 0
  };
}
```

#### 2.5 `calculatePackRunning(teamId, season)`
```javascript
/**
 * Calculate pack running metrics (gaps between runners)
 * @param {String} teamId - Team ID
 * @param {Number} season - Season year
 * @returns {Object} { avgGapBetweenRunners, packTightness, packConsistency }
 */
async calculatePackRunning(teamId, season) {
  const { data: meets } = await supabase
    .from('races')
    .select('id')
    .eq('team_id', teamId)
    .eq('season', season);
  
  let totalGap = 0;
  let gapCount = 0;
  
  for (const meet of meets) {
    const { data: results } = await supabase
      .from('results')
      .select('time')
      .eq('race_id', meet.id)
      .order('time', { ascending: true });
    
    // Calculate gaps between consecutive runners
    for (let i = 1; i < results.length; i++) {
      const gap = results[i].time - results[i-1].time;
      totalGap += gap;
      gapCount++;
    }
  }
  
  const avgGap = gapCount > 0 ? totalGap / gapCount : 0;
  
  return {
    avgGapBetweenRunners: avgGap,
    packTightness: avgGap > 0 ? 1 / (1 + avgGap / 10) : 0, // Normalized 0-1
    packConsistency: 0.75 // TODO: Calculate variance across meets
  };
}
```

#### 2.6 Helper Method `_calculateGroupStats(athletes)`
```javascript
/**
 * Calculate aggregate stats for a group of athletes
 * @param {Array} athletes - Array of athlete metrics
 * @returns {Object} { count, avgPace, bestTime, avgTime, totalRaces }
 */
_calculateGroupStats(athletes) {
  if (!athletes || athletes.length === 0) {
    return { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 };
  }
  
  const totalRaces = athletes.reduce((sum, a) => sum + (a.total_races || 0), 0);
  const totalTime = athletes.reduce((sum, a) => sum + (a.total_time_seconds || 0), 0);
  const totalMiles = athletes.reduce((sum, a) => sum + (a.total_miles || 0), 0);
  const bestTimes = athletes.map(a => a.best_time_5k).filter(t => t > 0);
  
  return {
    count: athletes.length,
    avgPace: totalMiles > 0 ? totalTime / totalMiles : 0,
    bestTime: bestTimes.length > 0 ? Math.min(...bestTimes) : 0,
    avgTime: totalRaces > 0 ? totalTime / totalRaces : 0,
    totalRaces: totalRaces
  };
}
```

---

### Phase 3: Integrate into `calculateTeamMetrics()`

Update the `calculateTeamMetrics()` method to call all enhanced calculations:

```javascript
async calculateTeamMetrics(teamId, season) {
  try {
    // ... existing code to get athleteMetrics ...
    
    // EXISTING: Basic metrics
    const teamMetrics = {
      team_id: teamId,
      season: season,
      total_athletes: athleteMetrics.length,
      total_races: totalRaces,
      // ... other basic fields ...
    };
    
    // NEW: Enhanced metrics
    teamMetrics.by_gender = this.calculateGenderBreakdown(athleteMetrics);
    teamMetrics.by_grade = this.calculateGradeBreakdown(athleteMetrics);
    teamMetrics.by_distance = await this.calculateDistanceBreakdown(teamId, season);
    teamMetrics.team_depth = await this.calculateTeamDepth(teamId, season);
    teamMetrics.pack_running = await this.calculatePackRunning(teamId, season);
    
    // Upsert with all fields
    await supabase
      .from('team_season_metrics')
      .upsert(teamMetrics, {
        onConflict: 'team_id,season'
      });
    
    return teamMetrics;
  } catch (error) {
    logger.error(`Error calculating team metrics: ${error.message}`, { error });
    throw error;
  }
}
```

---

### Phase 4: Update API Response

The `/enhanced-performance/team/:teamId/:season` endpoint should transform the data:

```javascript
router.get('/team/:teamId/:season', authenticate, authorizeTeamAccess, async (req, res) => {
  const { teamId, season } = req.params;
  const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
  
  const { data: teamMetrics } = await supabase
    .from('team_season_metrics')
    .select('*')
    .eq('team_id', resolvedTeamId)
    .eq('season', season)
    .single();
  
  if (!teamMetrics) {
    return res.status(404).json({ success: false, message: 'Metrics not found' });
  }
  
  // Transform to match UI expectations
  const enhancedMetrics = {
    teamId: teamMetrics.team_id,
    season: teamMetrics.season,
    totalAthletes: teamMetrics.total_athletes,
    totalRaces: teamMetrics.total_races,
    totalMiles: teamMetrics.total_miles,
    avgMilePace: { overall: teamMetrics.average_pace },
    byGender: teamMetrics.by_gender || {},
    byGrade: teamMetrics.by_grade || {},
    byDistance: teamMetrics.by_distance || {},
    teamDepth: teamMetrics.team_depth || {},
    packRunning: teamMetrics.pack_running || {}
  };
  
  res.json({ success: true, data: enhancedMetrics });
});
```

---

### Phase 5: Remove Duplicate "Enhanced" Button

Update `EnhancedCalculateMetricsPanel.tsx` to remove the separate enhanced calculation option since it's now all unified.

---

## Testing Checklist

After implementation:

1. ✅ Run migration to add JSONB columns
2. ✅ Recalculate metrics
3. ✅ Verify `team_season_metrics` has populated JSONB fields
4. ✅ Test Enhanced Overview tab shows data
5. ✅ Test Distance Analysis tab shows data
6. ✅ Verify all calculations are accurate

---

## Timeline Estimate

- **Phase 1 (Migration):** 2 minutes
- **Phase 2 (Methods):** 45 minutes
- **Phase 3 (Integration):** 15 minutes
- **Phase 4 (API):** 10 minutes
- **Phase 5 (UI cleanup):** 10 minutes

**Total: ~80 minutes for complete unified metrics**
