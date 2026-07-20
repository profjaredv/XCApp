# Scraper Setup Guide

The LeadPack XC scraper is now fully integrated and ready to use.

## What Was Set Up

1. **Playwright Scraper** (`backend/scrape_season_playwright.js`)
   - Scrapes race results from Athletic.net
   - Extracts athlete names, times, grades, distances, meet info
   - Can be run standalone or via API

2. **Data Importer** (`backend/utils/dataImporter.js`)
   - Processes scraped data into MongoDB
   - Creates/updates Races, Athletes, and Results
   - Handles duplicates gracefully

3. **Data Management API** (`backend/routes/dataManagement.js`)
   - `POST /api/data/import/:teamId/:season` - Import race data
   - `POST /api/data/calculate/:teamId/:season` - Calculate analytics
   - `POST /api/data/clear/:teamId/:season` - Clear season data

## How to Use

### Via Web UI
Navigate to the Data Management page in the app and:
1. Enter your Athletic.net Team ID
2. Select the season year
3. Click "Import Data"
4. Click "Calculate Metrics" after import completes

### Via API
```bash
# Import data
curl -X POST http://localhost:3001/api/data/import/YOUR_TEAM_ID/2024 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"athleticNetTeamId": "460"}'

# Calculate metrics
curl -X POST http://localhost:3001/api/data/calculate/YOUR_TEAM_ID/2024 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Clear season data
curl -X POST http://localhost:3001/api/data/clear/YOUR_TEAM_ID/2024 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Standalone Scraper
```bash
cd backend
node scrape_season_playwright.js --team_id 460 --year 2024 > output.csv
```

## Technical Details

### Database Schema
- **Races**: name, date, distance, season, team
- **Athletes**: name, grade, gender, graduationYear, team
- **Results**: athlete, race, time, grade, team

### Flow
1. Scraper hits Athletic.net and extracts HTML tables
2. Data is parsed into structured format
3. Importer creates/updates MongoDB documents
4. Calculation service computes analytics
5. Frontend displays the data

## Troubleshooting

- **Playwright not installed**: Run `cd backend && npm install`
- **Auth errors**: Make sure user has 'coach' role
- **No data imported**: Verify Athletic.net Team ID is correct
- **Scraper fails**: Check if Athletic.net changed their HTML structure

## Dependencies
- `playwright` - Browser automation
- `mongoose` - MongoDB ODM
- `express` - API framework
- `firebase-admin` - Authentication
