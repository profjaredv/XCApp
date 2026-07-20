# LeadPack XC - MongoDB to Supabase Migration Analysis

## Executive Summary
The application is partially migrated from MongoDB to Supabase. Critical data import and calculation paths are still using MongoDB models, causing data to not be saved or displayed correctly.

## Current Status

### ✅ Working (Supabase)
1. **Authentication** - Using Supabase Auth
2. **User Management** - `/backend/routes/users.js` uses Supabase
3. **Athletes List** - `/backend/routes/athletes.js` uses Supabase (after recent fixes)
4. **Analytics Display** - `/backend/routes/analytics.js` fetches from Supabase metrics tables

### ❌ Broken (Still Using MongoDB)
1. **Data Import** - `/backend/routes/teams.js` POST `/teams/scrape` (lines 196-226)
2. **Team Creation** - `/backend/routes/teams.js` POST `/teams` (lines 63-94)
3. **Roster Import** - `/backend/routes/teams.js` POST `/teams/roster` (lines 343-362)
4. **Data Clearing** - `/backend/routes/teams.js` DELETE `/teams/clear` (lines 391-396)
5. **Performance Calculations** - `/backend/services/performance/calculationService.js` (entire file)
6. **Enhanced Calculations** - `/backend/services/performance/enhancedCalculationService.js` (entire file)

## Critical Issues

### Issue 1: Data Import Not Saving to Supabase
**File:** `/backend/routes/teams.js` lines 196-226
**Problem:** Uses MongoDB models `Athlete.findOneAndUpdate()`, `Race.findOneAndUpdate()`, `Result.findOneAndUpdate()`
**Impact:** Scraped data (637 records) is not being saved to Supabase database
**Fix Required:** Rewrite to use Supabase upsert operations

### Issue 2: Analytics Calculations Reading from MongoDB
**File:** `/backend/services/performance/calculationServiceSupabase.js`
**Problem:** Despite the filename, it may still have MongoDB dependencies
**Impact:** Calculations may be reading from empty MongoDB instead of Supabase
**Fix Required:** Verify all queries use Supabase client

### Issue 3: Missing Race Data in Athlete Records
**Problem:** Athletes show in list but have no race history
**Likely Cause:** Results table not properly linked or not being queried correctly
**Fix Required:** Verify foreign key relationships and joins

### Issue 4: Best Times Showing as 0
**Problem:** `best_time_5k` in metrics is 0
**Cause:** Distance matching logic looks for exactly 3.1 miles, but data has 5000 meters
**Fix Required:** Improve distance normalization in calculation service

## Data Flow Analysis

### Current (Broken) Flow:
```
Scraper → CSV → MongoDB Models → ❌ (data lost)
                                ↓
                          MongoDB (empty)
                                ↓
                    Calculations read nothing
                                ↓
                          Metrics tables empty
                                ↓
                        Analytics shows zeros
```

### Required (Fixed) Flow:
```
Scraper → CSV → Supabase Insert/Upsert → ✅
                                ↓
                    Supabase (athletes, races, results)
                                ↓
                    Calculations read from Supabase
                                ↓
                    Write to metrics tables
                                ↓
                    Analytics displays correctly
```

## Files Requiring Complete Rewrite

### Priority 1 (Critical - Data Import)
1. `/backend/routes/teams.js` - POST `/teams/scrape` endpoint
   - Lines 196-226: Replace MongoDB upserts with Supabase
   - Lines 121-126: Replace MongoDB delete operations
   - Lines 229-238: Replace MongoDB team update

### Priority 2 (High - Calculations)
2. `/backend/services/performance/calculationService.js`
   - Replace all MongoDB model imports
   - Replace all `.find()`, `.findOne()` with Supabase queries
   
3. `/backend/services/performance/enhancedCalculationService.js`
   - Same as above

### Priority 3 (Medium - Other Operations)
4. `/backend/routes/teams.js` - Other endpoints
   - POST `/teams` (team creation)
   - POST `/teams/roster` (roster import)
   - DELETE `/teams/clear` (data clearing)

## Database Schema Verification Needed

### Tables to Verify:
1. **athletes** - columns: id, team_id, name, gender, grade, graduation_year
2. **races** - columns: id, team_id, name, date, distance, distance_meters, season
3. **results** - columns: id, athlete_id, race_id, team_id, time, grade
4. **athlete_season_metrics** - columns: athlete_id, team_id, season, best_time_5k, etc.
5. **meet_performance_metrics** - columns: race_id, team_id, season, etc.
6. **team_season_metrics** - columns: team_id, season, total_miles, etc.

### Foreign Key Relationships:
- results.athlete_id → athletes.id
- results.race_id → races.id
- athlete_season_metrics.athlete_id → athletes.id
- meet_performance_metrics.race_id → races.id

## Action Plan

### Phase 1: Fix Data Import (Immediate)
1. Rewrite `/backend/routes/teams.js` POST `/teams/scrape` to use Supabase
2. Test with sample data to verify saves correctly
3. Verify data appears in Supabase dashboard

### Phase 2: Fix Calculations (High Priority)
1. Audit `calculationServiceSupabase.js` for any MongoDB remnants
2. Fix distance matching logic for best times
3. Verify calculations write to metrics tables
4. Test calculation trigger after import

### Phase 3: Fix Display (Medium Priority)
1. Verify athlete modal fetches race history correctly
2. Fix any remaining MongoDB `_id` references in frontend
3. Test all analytics visualizations

### Phase 4: Complete Migration (Low Priority)
1. Rewrite team creation endpoint
2. Rewrite roster import endpoint
3. Rewrite data clearing endpoint
4. Remove all MongoDB dependencies

## Testing Checklist

After each fix:
- [ ] Import 2025 season data
- [ ] Verify 637 records in `results` table
- [ ] Verify athletes created in `athletes` table
- [ ] Verify races created in `races` table
- [ ] Trigger analytics calculation
- [ ] Verify metrics in `athlete_season_metrics` table
- [ ] Check analytics page displays data
- [ ] Click athlete to open modal
- [ ] Verify race history shows in modal
- [ ] Verify best times are non-zero

## Estimated Effort

- **Phase 1:** 2-3 hours (critical path)
- **Phase 2:** 2-3 hours (already partially done)
- **Phase 3:** 1-2 hours (mostly done)
- **Phase 4:** 3-4 hours (can be deferred)

**Total:** 8-12 hours to full working state
