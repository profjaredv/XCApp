# XCTF Data Flow Reference

## Import Process

### Scraping Phase
- **Race Data Collection**
  - Scrapes list of races from Athletic.net
  - Captures race names, dates, and distances
  - Normalizes distances to meters (`distance_m`)
  - Parses meet dates into `meet_date` (YYYY-MM-DD) and `meet_ts` fields

- **Athlete Data Collection**
  - Scrapes each athlete name, gender, grade
  - Creates unique `athlete_key` with `athlete_id`
  - Captures race times for each athlete in each race
  - Infers gender from row tokens, column headers, and nearby headings

### Database Storage Phase
- **Athlete Records**
  - Upserts athlete records (creates if new, updates if existing)
  - Indexes by name and team
  - Calculates graduation year based on grade and season year
  - Preserves athlete records across seasons

- **Race Records**
  - Creates race documents with name, date, distance, season, team
  - Ensures uniqueness by name, date, and team
  - Stores normalized distance values

- **Result Records**
  - Creates result documents linking athletes to races
  - Stores time, grade, and place information
  - Ensures uniqueness by athlete and race
  - Uses expanded document IDs (including race_label and time_str) to avoid merges

## Calculation Process

### Triggered By
- **Manual API Call**: `/api/performance/calculate/:teamId/:season`
- **NOT Automatic**: Importing data does NOT automatically trigger calculations

### Calculation Flow
1. **Athlete Race Metrics Calculation**
   - Processes each athlete's races
   - Calculates:
     - Total races count
     - Total miles (using normalized distances)
     - Average mile pace
     - Best time and meet
     - Improvement percentage
     - Total time dropped

2. **Team Metrics Aggregation**
   - Aggregates metrics from all athletes
   - Uses unique race IDs to count actual races and miles
   - Calculates:
     - Total races across team
     - Total miles across team
     - Weighted average pace
     - Best times by gender
     - Athlete count

3. **Meet Performance Metrics**
   - Calculates metrics for each meet
   - Determines team placement
   - Analyzes individual performances

4. **Storage**
   - Stores metrics in:
     - `teamseasonmetrics` collection
     - `athleteseasonmetrics` collection
     - `meetperformancemetrics` collection

## Important Notes

### Season Handling
- **Each season is processed independently**
- Calculations are season-specific
- Multi-season views are handled by frontend aggregation

### Potential Issues
- **Race Deduplication**: System relies on unique race IDs
- **Distance Normalization**: Critical for accurate pace calculations
- **Season Filtering**: Must be applied consistently

### Best Practices
1. **Clear Before Import**:
   - Always clear season data before reimporting
   - Prevents duplicate races and inflated metrics

2. **Manual Calculation Trigger**:
   - After import, manually trigger calculations via API
   - Endpoint: `/api/performance/calculate/:teamId/:season`

3. **Verification**:
   - Check race counts match expected values
   - Verify athlete counts are accurate
   - Confirm total miles are reasonable

## Troubleshooting

### Inflated Metrics
- **Cause**: Duplicate races or incorrect season filtering
- **Solution**: Clear season data and reimport

### Missing Data
- **Cause**: Calculation not triggered after import
- **Solution**: Manually trigger calculation API

### Incorrect Pace
- **Cause**: Distance normalization issues
- **Solution**: Verify race distances are correctly stored
