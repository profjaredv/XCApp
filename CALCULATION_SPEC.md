# LeadPack XC Calculation Specification

This document defines EXACTLY how all metrics should be calculated and stored.

## Data Flow

```
Raw Data (races, athletes, results)
    ↓
Calculate Athlete Metrics (per athlete, per season)
    ↓
Calculate Meet Metrics (per race/meet)
    ↓
Calculate Team Metrics (per team, per season)
    ↓
Store in Database
    ↓
Display in UI
```

---

## 1. ATHLETE SEASON METRICS

**Table:** `athlete_season_metrics`
**Granularity:** One record per athlete per season

### Input Data
- All `results` for athlete in a given season
- Joined with `races` to get distance/date info
- Filtered to 5K races only (distance_meters = 5000)

### Calculations

| Field | Calculation | Example |
|-------|-------------|---------|
| `athlete_id` | From athlete record | uuid |
| `team_id` | From athlete record | uuid |
| `season` | From race.season | "2025" (text) |
| `name` | From athlete.name | "John Doe" |
| `gender` | Normalized: "M" or "F" | "M" |
| `grade` | From athlete.grade | "12" |
| `total_races` | COUNT(results for athlete in season) | 7 |
| `total_miles` | SUM(race.distance_meters / 1609.34) | 21.75 |
| `total_time_seconds` | SUM(result.time) | 8400 |
| `average_pace` | AVG(result.time / (race.distance_meters / 1609.34)) | 387.5 sec/mi |
| `best_pace` | MIN(result.time / (race.distance_meters / 1609.34)) | 360.2 sec/mi |
| `best_time_5k` | MIN(result.time WHERE distance = 5000m) | 1125 sec (18:45) |
| `improvement` | ((first_race_pace - last_race_pace) / first_race_pace) * 100 | 7.5% |
| `calculated_at` | NOW() | timestamp |

### Pace Calculation Details
```javascript
// For each result:
const distanceInMiles = race.distance_meters / 1609.34;  // 5000m = 3.106856 miles
const paceSecondsPerMile = result.time / distanceInMiles;

// Example: 19:30 (1170 seconds) for 5K
// 1170 / 3.106856 = 376.5 seconds/mile = 6:16.5/mile
```

---

## 2. MEET PERFORMANCE METRICS

**Table:** `meet_performance_metrics`
**Granularity:** One record per race per team

### Input Data
- All `results` for a specific race
- Filtered to team's athletes only
- Joined with athlete data for gender/grade

### Calculations

| Field | Calculation | Example |
|-------|-------------|---------|
| `race_id` | From race record | uuid |
| `team_id` | From team | uuid |
| `season` | From race.season | "2025" (text) |
| `meet_name` | From race.name | "Fort Steilacoom Invitational" |
| `meet_date` | From race.date | "2025-09-06" |
| `distance` | From race.distance_meters | 5000 |
| `distance_label` | From race.distance | "5K" |
| `participant_count` | COUNT(results for race) | 15 |
| `male_participant_count` | COUNT(results WHERE gender = 'M') | 8 |
| `female_participant_count` | COUNT(results WHERE gender = 'F') | 7 |
| `average_time` | AVG(result.time) | 1200 sec (20:00) |
| `average_pace` | AVG(result.time / distance_in_miles) | 386.2 sec/mi (6:26/mi) |
| `best_time` | MIN(result.time) | 1080 sec (18:00) |
| `team_score` | SUM(top 7 times) / 7 | 1150 sec avg |
| `metrics` | JSONB with full breakdown (see below) | {...} |
| `calculated_at` | NOW() | timestamp |

### Metrics JSONB Structure
```json
{
  "overall": {
    "totalRaces": 15,
    "avgTimeSeconds": 1200,
    "avgMilePace": {
      "overall": 386.2,
      "formatted": "6:26"
    },
    "bestTime": 1080,
    "teamBestTime": 1150
  },
  "byGender": {
    "M": {
      "totalRaces": 8,
      "avgTimeSeconds": 1150,
      "avgMilePace": {
        "overall": 370.1,
        "formatted": "6:10"
      },
      "bestTime": 1080
    },
    "F": {
      "totalRaces": 7,
      "avgTimeSeconds": 1260,
      "avgMilePace": {
        "overall": 405.5,
        "formatted": "6:45"
      },
      "bestTime": 1200
    }
  },
  "byGrade": {
    "12": {
      "totalRaces": 5,
      "avgTimeSeconds": 1140,
      "avgMilePace": {
        "overall": 366.9,
        "formatted": "6:07"
      }
    },
    "11": { /* ... */ },
    "10": { /* ... */ },
    "9": { /* ... */ }
  }
}
```

---

## 3. TEAM SEASON METRICS

**Table:** `team_season_metrics`
**Granularity:** One record per team per season

### Input Data
- All `athlete_season_metrics` for team/season
- All `meet_performance_metrics` for team/season
- Sorted by date to find first/last meet

### Calculations

| Field | Calculation | Example |
|-------|-------------|---------|
| `team_id` | From team | uuid |
| `season` | Season year | "2025" (text) |
| `total_athletes` | COUNT(DISTINCT athlete_id) | 110 |
| `male_athlete_count` | COUNT(DISTINCT athlete_id WHERE gender = 'M') | 60 |
| `female_athlete_count` | COUNT(DISTINCT athlete_id WHERE gender = 'F') | 50 |
| `meet_count` | COUNT(DISTINCT race_id) | 7 |
| `total_races` | COUNT(all results) | 630 |
| `total_miles` | SUM(all distances) | 1960.3 |
| `average_pace` | AVG(all paces) | 387.5 sec/mi (6:27/mi) |
| `improvement_percent` | ((first_meet_avg - last_meet_avg) / first_meet_avg) * 100 | 5.2% |
| `first_meet` | JSONB (see below) | {...} |
| `last_meet` | JSONB (see below) | {...} |
| `calculated_at` | NOW() | timestamp |

### First/Last Meet JSONB Structure
```json
{
  "name": "Fort Steilacoom Invitational",
  "date": "2025-09-06",
  "avgPace": 395.2,      // seconds per mile
  "avgTime": 1228.5      // seconds
}
```

### Improvement Calculation
```javascript
// Get first meet (earliest date)
const firstMeet = meets.sort((a, b) => new Date(a.meet_date) - new Date(b.meet_date))[0];

// Get last meet (latest date)
const lastMeet = meets.sort((a, b) => new Date(b.meet_date) - new Date(a.meet_date))[0];

// Calculate improvement
const firstAvgPace = firstMeet.average_pace;  // e.g., 395.2 sec/mi
const lastAvgPace = lastMeet.average_pace;    // e.g., 375.0 sec/mi

const improvementPercent = ((firstAvgPace - lastAvgPace) / firstAvgPace) * 100;
// (395.2 - 375.0) / 395.2 * 100 = 5.11%
```

---

## 4. PACE FORMATTING

### Seconds to MM:SS Format

```javascript
function formatPace(secondsPerMile) {
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Examples:
// 387.5 → "6:27"
// 360.0 → "6:00"
// 395.2 → "6:35"
```

---

## 5. CURRENT ISSUES IDENTIFIED

### Issue 1: Wrong Average Pace Display
**Symptom:** Shows "13:34/mi" instead of expected "6:27/mi"
**Likely Cause:** 
- Pace stored as total time instead of pace per mile
- OR: Pace calculation using wrong distance conversion
- OR: UI displaying wrong field

**Fix Required:**
1. Verify `average_pace` in database is seconds per mile (should be ~387, not ~814)
2. Verify UI is formatting correctly (should divide by 60 for minutes)

### Issue 2: Season Pace Trend Shows 0:00/mi
**Symptom:** All meets show "0:00/mi" in chart
**Likely Cause:**
- `meet_performance_metrics.average_pace` is NULL or 0
- OR: Chart is reading wrong field from metrics JSONB

**Fix Required:**
1. Check if `average_pace` column is populated in `meet_performance_metrics`
2. Check if chart is reading from correct field

### Issue 3: Calculation Summary Shows 0s
**Symptom:** After calculation, shows "0 Athletes, 0 Races, 0.0 Total Miles"
**Likely Cause:**
- Calculation endpoint returns wrong data
- OR: UI reading wrong response fields

**Fix Required:**
1. Check what `calculateMetrics` endpoint returns
2. Verify UI is reading correct response structure

---

## 6. VERIFICATION QUERIES

Run these in Supabase to verify data:

```sql
-- Check team season metrics
SELECT 
    season,
    total_athletes,
    meet_count,
    total_races,
    total_miles,
    average_pace,
    improvement_percent,
    first_meet,
    last_meet
FROM team_season_metrics
WHERE team_id = 'YOUR_TEAM_ID' AND season = '2025';

-- Check meet metrics
SELECT 
    meet_name,
    meet_date,
    participant_count,
    average_pace,
    average_time,
    metrics
FROM meet_performance_metrics
WHERE team_id = 'YOUR_TEAM_ID' AND season = '2025'
ORDER BY meet_date;

-- Check athlete metrics
SELECT 
    name,
    gender,
    grade,
    total_races,
    average_pace,
    best_pace,
    improvement
FROM athlete_season_metrics
WHERE team_id = 'YOUR_TEAM_ID' AND season = '2025'
ORDER BY average_pace
LIMIT 10;
```

---

## Next Steps

1. Run verification queries to see actual data in database
2. Compare with expected calculations
3. Fix calculation logic where mismatches found
4. Fix UI display logic where needed
5. Re-test end-to-end
