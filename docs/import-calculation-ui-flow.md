# Data Import & Calculation UI Flow

## Overview
This document outlines the proposed UI flow for importing data and triggering calculations in the XCTF application.

## UI Components

### 1. Data Management Page
Add a dedicated "Data Management" section in the admin dashboard with clear steps:

```
┌─────────────────────────────────────────────────────────┐
│ DATA MANAGEMENT                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 1: CLEAR SEASON DATA                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Season: [2025 ▼]   Team: [Current Team ▼]       │    │
│  │                                                 │    │
│  │ [CLEAR SEASON DATA]                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  STEP 2: IMPORT SEASON DATA                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Season: [2025 ▼]   Team ID: [460 ▼]             │    │
│  │                                                 │    │
│  │ [IMPORT DATA]                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  STEP 3: CALCULATE METRICS                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Season: [2025 ▼]   Team: [Current Team ▼]       │    │
│  │                                                 │    │
│  │ [CALCULATE METRICS]                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. Import Wizard
Convert the current import process into a wizard with progress indicators:

```
┌─────────────────────────────────────────────────────────┐
│ IMPORT DATA WIZARD                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ● STEP 1: CLEAR DATA  ○ STEP 2: IMPORT  ○ STEP 3: CALC │
│                                                         │
│  Clear existing data for season 2025?                   │
│                                                         │
│  This will remove:                                      │
│  - All races for this season                            │
│  - All results for this season                          │
│  - All metrics for this season                          │
│                                                         │
│  [CLEAR DATA]                [SKIP]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3. Calculation Status Panel
Add a status panel showing calculation progress:

```
┌─────────────────────────────────────────────────────────┐
│ CALCULATION STATUS                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ● Processing athlete metrics...                        │
│  ○ Aggregating team metrics                             │
│  ○ Calculating meet performance                         │
│  ○ Storing results                                      │
│                                                         │
│  Progress: ████████████████████░░░░░  80%               │
│                                                         │
│  [CANCEL]                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4. Verification Panel
Add a verification step after calculation:

```
┌─────────────────────────────────────────────────────────┐
│ CALCULATION COMPLETE                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✓ Processed 103 athletes                              │
│  ✓ Found 12 races                                       │
│  ✓ Calculated 1,236 results                            │
│  ✓ Total miles: 3,829.2                                │
│                                                         │
│  [VIEW METRICS]     [BACK TO DASHBOARD]                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Implementation Details

### Backend API Endpoints
- `POST /api/data/clear/:teamId/:season` - Clear season data
- `POST /api/data/import/:teamId/:season` - Import data
- `POST /api/performance/calculate/:teamId/:season` - Calculate metrics
- `GET /api/data/status/:teamId/:season` - Get import/calculation status

### Frontend Components
1. **DataManagementPage.tsx**
   - Main container for the data management UI
   - Handles step navigation and state

2. **ClearDataPanel.tsx**
   - UI for clearing season data
   - Confirmation dialog
   - Status feedback

3. **ImportDataPanel.tsx**
   - UI for importing season data
   - Progress indicators
   - Error handling

4. **CalculateMetricsPanel.tsx**
   - UI for triggering and monitoring calculations
   - Real-time status updates
   - Verification display

### State Management
- Use React Query for API calls and caching
- Maintain wizard step in local state
- Store calculation status in global state

## User Flow

1. User navigates to Data Management
2. User selects season and team
3. User clicks "Clear Season Data" (with confirmation)
4. User proceeds to import data
5. After import completes, user is prompted to calculate metrics
6. User clicks "Calculate Metrics"
7. Progress is displayed during calculation
8. Verification summary is shown upon completion

## Error Handling

- Clear error messages for each step
- Option to retry failed operations
- Detailed logs available for troubleshooting

## Future Enhancements

- Scheduled automatic calculations
- Batch processing for multiple seasons
- Email notifications when long-running calculations complete
