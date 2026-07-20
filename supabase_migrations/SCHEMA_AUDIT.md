# Supabase Schema Audit

This document lists all tables and columns expected by the application code.

## Tables and Expected Columns

### 1. `teams`
- `id` (uuid, primary key)
- `name` (text)
- `coach_uid` (text)
- `join_code` (text)
- `athletic_team_id` (text)
- `imported_seasons` (text[])
- `results` (jsonb, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 2. `athletes`
- `id` (uuid, primary key)
- `team_id` (uuid, foreign key → teams.id)
- `name` (text)
- `gender` (text) -- 'M', 'F', 'Men', 'Women'
- `grade` (text or integer)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 3. `races`
- `id` (uuid, primary key)
- `team_id` (uuid, foreign key → teams.id)
- `name` (text)
- `date` (date)
- `season` (text) -- stored as string (e.g., '2025')
- `distance` (text) -- e.g., '5K', '5,000 Meters'
- `distance_meters` (numeric) -- e.g., 5000
- `location` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 4. `results`
- `id` (uuid, primary key)
- `race_id` (uuid, foreign key → races.id)
- `athlete_id` (uuid, foreign key → athletes.id)
- `time` (numeric) -- seconds
- `place` (integer, nullable)
- `grade` (text or integer, nullable)
- `created_at` (timestamp)

### 5. `athlete_season_metrics`
**Purpose:** Aggregated metrics per athlete per season

- `id` (uuid, primary key)
- `athlete_id` (uuid, foreign key → athletes.id)
- `team_id` (uuid, foreign key → teams.id)
- `season` (text) -- e.g., '2025'
- `name` (text) -- athlete name (denormalized)
- `gender` (text) -- 'M' or 'F'
- `grade` (text)
- `total_races` (integer)
- `total_miles` (numeric)
- `total_time_seconds` (numeric)
- `average_pace` (numeric) -- seconds per mile
- `best_pace` (numeric) -- seconds per mile
- `best_time_5k` (numeric) -- seconds
- `improvement` (numeric) -- percentage
- `improvement_percent` (numeric) -- alias/alternative name
- `calculated_at` (timestamp)
- **UNIQUE CONSTRAINT:** (athlete_id, team_id, season)

### 6. `meet_performance_metrics`
**Purpose:** Aggregated metrics per meet (race)

- `id` (uuid, primary key)
- `race_id` (uuid, foreign key → races.id)
- `team_id` (uuid, foreign key → teams.id)
- `season` (text) -- e.g., '2025'
- `meet_name` (text)
- `meet_date` (date)
- `distance` (numeric) -- meters
- `distance_label` (text) -- e.g., '5K'
- `participant_count` (integer)
- `male_participant_count` (integer)
- `female_participant_count` (integer)
- `average_time` (numeric) -- seconds
- `average_pace` (numeric) -- seconds per mile
- `best_time` (numeric) -- seconds
- `team_score` (numeric) -- top-7 sum
- `metrics` (jsonb) -- full breakdown with gender/grade
- `calculated_at` (timestamp)
- **UNIQUE CONSTRAINT:** (race_id, team_id)

### 7. `team_season_metrics`
**Purpose:** Aggregated metrics per team per season

- `id` (uuid, primary key)
- `team_id` (uuid, foreign key → teams.id)
- `season` (text) -- e.g., '2025'
- `athlete_count` (integer)
- `male_athlete_count` (integer)
- `female_athlete_count` (integer)
- `meet_count` (integer)
- `total_races` (integer)
- `total_miles` (numeric)
- `average_pace` (numeric) -- seconds per mile
- `improvement_percent` (numeric)
- `first_meet` (jsonb) -- ⚠️ MISSING - needs to be added
- `last_meet` (jsonb) -- ⚠️ MISSING - needs to be added
- `calculated_at` (timestamp)
- **UNIQUE CONSTRAINT:** (team_id, season)

**Structure for first_meet/last_meet:**
```json
{
  "name": "Meet Name",
  "date": "2025-09-01",
  "avgPace": 387.5,
  "avgTime": 1200.5
}
```

## Known Issues

### ⚠️ Missing Columns
1. **team_season_metrics**
   - `first_meet` (jsonb) - MISSING
   - `last_meet` (jsonb) - MISSING

### 🔍 Potential Issues to Check
1. **Inconsistent column naming**
   - Some tables use `created_at`, others might not
   - Check if all foreign keys are properly indexed

2. **Type mismatches**
   - `grade` is sometimes text, sometimes integer
   - `season` should consistently be text (not integer)

3. **Missing indexes**
   - Foreign keys should have indexes
   - Frequently queried columns (season, team_id) should be indexed

## Next Steps

1. Run the schema verification script (see `verify_schema.sql`)
2. Apply missing column migrations
3. Add missing indexes
4. Verify constraints are in place
