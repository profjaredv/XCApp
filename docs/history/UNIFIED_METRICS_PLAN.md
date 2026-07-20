# Unified Metrics Calculation Plan

## Problem
Currently have TWO separate calculation systems:
1. **Basic Metrics** (`/performance/calculate`) - Partially working
2. **Enhanced Metrics** (`/enhanced-performance/calculate`) - Not implemented

This creates confusion and incomplete data.

## Solution: Merge into Single Calculation

### Single Endpoint: `/performance/calculate/:teamId/:season`

**Calculates ALL metrics in one pass:**

#### 1. Athlete-Level Metrics ✅ (Already implemented)
- `total_races`, `total_miles`, `total_time_seconds`
- `average_pace`, `best_pace`, `best_time_5k`
- `improvement`

#### 2. Meet-Level Metrics ✅ (Already implemented)
- `participant_count`, `average_time`, `average_pace`
- `best_time`, `team_score`
- Gender breakdown (male/female counts)

#### 3. Team-Level Basic Metrics ✅ (Already implemented)
- `total_athletes`, `total_races`, `total_miles`
- `average_pace`, `male_athlete_count`, `female_athlete_count`
- `meet_count`, `improvement_percent`

#### 4. Team-Level Enhanced Metrics ❌ (NEED TO ADD)

**Add to `team_season_metrics` table as JSONB columns:**

```sql
ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS by_gender JSONB,
ADD COLUMN IF NOT EXISTS by_grade JSONB,
ADD COLUMN IF NOT EXISTS by_distance JSONB,
ADD COLUMN IF NOT EXISTS team_depth JSONB,
ADD COLUMN IF NOT EXISTS pack_running JSONB;
```

**Calculate and store:**

##### a) Gender Breakdown (`by_gender`)
```javascript
{
  men: {
    count: 73,
    avgPace: 380.5,  // sec/mi
    bestTime: 950.2,  // seconds (5K)
    avgTime: 1250.3,
    totalRaces: 420
  },
  women: {
    count: 37,
    avgPace: 420.8,
    bestTime: 1100.5,
    avgTime: 1380.2,
    totalRaces: 210
  }
}
```

##### b) Grade Breakdown (`by_grade`)
```javascript
{
  grade9: { count: 25, avgPace: 450.2, bestTime: 1150.3 },
  grade10: { count: 30, avgPace: 420.5, bestTime: 1080.2 },
  grade11: { count: 28, avgPace: 390.8, bestTime: 1020.5 },
  grade12: { count: 27, avgPace: 370.2, bestTime: 980.1 }
}
```

##### c) Distance Breakdown (`by_distance`)
```javascript
{
  oneMile: {
    athleteCount: 94,
    raceCount: 94,
    avgTime: 453.5,
    bestTime: 320.2,
    avgPace: 453.5  // 1 mile = pace
  },
  onePointFiveMile: {
    athleteCount: 95,
    raceCount: 95,
    avgTime: 695.3,
    bestTime: 480.5,
    avgPace: 463.5
  },
  threeMile: {
    athleteCount: 80,
    raceCount: 80,
    avgTime: 1314.5,
    bestTime: 950.2,
    avgPace: 438.2
  },
  fiveK: {
    athleteCount: 96,
    raceCount: 288,  // 3 races * 96 athletes
    avgTime: 1394.8,
    bestTime: 1020.5,
    avgPace: 449.0
  }
}
```

##### d) Team Depth (`team_depth`)
```javascript
{
  top5Spread: 45.2,      // seconds between 1st and 5th runner (avg across meets)
  top7Spread: 68.5,      // seconds between 1st and 7th runner
  depthScore: 8.2,       // lower is better (avg gap per runner)
  varsityAvgTime: 1250.3,  // avg of top 7
  jvAvgTime: 1380.5        // avg of 8+
}
```

##### e) Pack Running (`pack_running`)
```javascript
{
  avgGapBetweenRunners: 12.3,  // avg seconds between consecutive team runners
  packTightness: 0.85,          // 0-1 score (1 = very tight pack)
  packConsistency: 0.78,        // how consistent pack is across meets
  splitAnalysis: {
    first_mile: { avgGap: 8.5, tightness: 0.90 },
    second_mile: { avgGap: 10.2, tightness: 0.82 },
    third_mile: { avgGap: 15.8, tightness: 0.70 }
  }
}
```

---

## Implementation Steps

### Step 1: Add JSONB columns to database ✅
```sql
ALTER TABLE team_season_metrics
ADD COLUMN IF NOT EXISTS by_gender JSONB,
ADD COLUMN IF NOT EXISTS by_grade JSONB,
ADD COLUMN IF NOT EXISTS by_distance JSONB,
ADD COLUMN IF NOT EXISTS team_depth JSONB,
ADD COLUMN IF NOT EXISTS pack_running JSONB;
```

### Step 2: Update `calculationServiceSupabase.js` ✅
Add new calculation methods:
- `calculateGenderBreakdown(athleteMetrics)`
- `calculateGradeBreakdown(athleteMetrics)`
- `calculateDistanceBreakdown(results, races)`
- `calculateTeamDepth(meetMetrics)`
- `calculatePackRunning(meetMetrics)`

### Step 3: Call all calculations in `calculateTeamMetrics()` ✅
```javascript
const byGender = this.calculateGenderBreakdown(athleteMetrics);
const byGrade = this.calculateGradeBreakdown(athleteMetrics);
const byDistance = await this.calculateDistanceBreakdown(teamId, season);
const teamDepth = this.calculateTeamDepth(meetMetrics);
const packRunning = this.calculatePackRunning(meetMetrics);

// Add to teamMetrics object
teamMetrics.by_gender = byGender;
teamMetrics.by_grade = byGrade;
teamMetrics.by_distance = byDistance;
teamMetrics.team_depth = teamDepth;
teamMetrics.pack_running = packRunning;
```

### Step 4: Update `/enhanced-performance/team/:teamId/:season` endpoint ✅
Transform the stored JSONB into the expected `EnhancedTeamMetrics` format:
```javascript
const enhancedMetrics = {
  teamId: teamMetrics.team_id,
  season: teamMetrics.season,
  totalAthletes: teamMetrics.total_athletes,
  totalRaces: teamMetrics.total_races,
  totalMiles: teamMetrics.total_miles,
  avgMilePace: { overall: teamMetrics.average_pace },
  byGender: teamMetrics.by_gender,
  byGrade: teamMetrics.by_grade,
  byDistance: teamMetrics.by_distance,
  teamDepth: teamMetrics.team_depth,
  packRunning: teamMetrics.pack_running
};
```

### Step 5: Remove separate "Enhanced" calculation button ✅
- Keep only ONE "Calculate Metrics" button
- Remove `/enhanced-performance/calculate` endpoint (or make it call the same service)
- Update UI to show single unified flow

---

## Benefits

1. ✅ **Single source of truth** - One calculation, one dataset
2. ✅ **No confusion** - One button, clear workflow
3. ✅ **Complete data** - All metrics calculated together
4. ✅ **Better performance** - One pass through data instead of two
5. ✅ **Easier maintenance** - One calculation service to maintain

---

## Timeline

- **Step 1 (SQL):** 2 minutes
- **Step 2 (Calculations):** 30 minutes
- **Step 3 (Integration):** 10 minutes
- **Step 4 (Endpoint):** 10 minutes
- **Step 5 (UI cleanup):** 15 minutes

**Total: ~70 minutes for complete implementation**

---

## Quick Win Option

If you want to see data NOW:
1. Wait for Railway deployment (upsert fix)
2. Recalculate basic metrics
3. Implement enhanced metrics later

The basic metrics should at least show:
- Total athletes, races, miles
- Average pace
- Meet count
- Gender counts
