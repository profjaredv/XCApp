# Data Management Workflow

This document outlines the proper workflow for managing cross-country team data in the XCTF Analytics application.

## Overview

The data management process consists of three key steps:
1. **Clear Season Data** - Remove existing data for a specific season
2. **Import Season Data** - Import new data from Athletic.net
3. **Calculate Metrics** - Process the imported data to generate analytics

Following this workflow ensures accurate metrics and prevents data duplication issues.

## Step 1: Clear Season Data

Before importing new data for a season, it's recommended to clear existing data:

- Clears all races, results, and metrics for the selected season
- Preserves athlete profiles and team information
- Prevents duplicate entries and inflated metrics
- Takes only a few seconds to complete

**When to use:**
- Before reimporting a season's data
- When metrics appear incorrect or inflated
- After making changes to the data import configuration

## Step 2: Import Season Data

After clearing the season data, you can import new data:

- Imports races, athletes, and results from Athletic.net
- Requires your Athletic.net Team ID (found in the URL of your team's page)
- Normalizes race distances to ensure consistent metrics
- Deduplicates results using composite keys (athlete_key + meet date/ts + distance_m)
- May take several minutes depending on the amount of data

**Important Notes:**
- The core scraper logic is stable and handles:
  - Distance normalization (Miles/Kilometers/Meters → distance_m)
  - Date parsing (meet_date in YYYY-MM-DD format)
  - Athlete identification (using athlete_key with athlete_id)
  - Gender inference from various sources in the HTML
  - Grade parsing

## Step 3: Calculate Metrics

After importing data, you must calculate metrics:

- Processes all imported race data
- Calculates athlete-level metrics (total races, miles, pace, etc.)
- Aggregates team-level metrics
- Analyzes meet performances
- Stores results in the database for fast retrieval
- May take several minutes for large datasets

**Why This Step Is Required:**
- Imported data is stored in its raw form
- Metrics must be pre-calculated for efficient analytics
- Without this step, analytics pages will show incomplete or incorrect data

## Best Practices

1. **Always Follow the Complete Workflow**
   - Don't skip steps, especially the calculation step
   - The process is designed to ensure data integrity

2. **Verify Results After Import**
   - Check that the number of races and athletes matches expectations
   - Verify that metrics appear reasonable (e.g., total miles)

3. **Clear Data Before Reimporting**
   - Always clear season data before reimporting to prevent duplicates
   - This ensures a clean slate for accurate metrics

4. **Handle Multiple Seasons Carefully**
   - Each season should be managed independently
   - Clear and import one season at a time for best results

## Troubleshooting

### Inflated Metrics
- **Symptom**: Unusually high race counts or total miles
- **Cause**: Duplicate races or results in the database
- **Solution**: Clear season data and reimport

### Missing Data
- **Symptom**: Athletes or races not appearing in analytics
- **Cause**: Calculation step may have been skipped
- **Solution**: Run the Calculate Metrics step

### Incorrect Pace Calculations
- **Symptom**: Pace values seem wrong or inconsistent
- **Cause**: Distance normalization issues
- **Solution**: Clear data, reimport, and recalculate metrics

## Technical Details

The data management process interacts with several MongoDB collections:
- `races` - Stores race information (name, date, distance)
- `results` - Links athletes to races with time and place
- `teamseasonmetrics` - Stores aggregated team metrics
- `athleteseasonmetrics` - Stores individual athlete metrics
- `meetperformancemetrics` - Stores meet-specific analytics

Each step in the workflow is designed to maintain data integrity across these collections.
