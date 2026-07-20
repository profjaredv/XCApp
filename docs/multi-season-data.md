# Multi-Season Athlete Data Implementation

This document outlines the implementation of multi-season athlete data retrieval and display in the XC Analytics application.

## Backend Implementation

A new endpoint was added to retrieve athlete performance metrics across all seasons:

```
GET /api/performance/athlete/:athleteId/all-seasons
```

This endpoint:
- Retrieves all seasons where the athlete has race data
- Standardizes 5K race identification (3.1 miles with ±100 meter tolerance)
- Returns a structured response with metrics for each season
- Caches results for performance optimization

## Frontend Implementation

### API Service

The `performanceService.ts` file was updated with:
- A new `AthleteSeasonMetricsData` interface to properly type multi-season athlete data
- A new `getAthleteAllSeasons` method to fetch data from the backend endpoint

### React Query Hook

A new hook `useAthleteAllSeasons` was added to `usePerformanceMetrics.ts` that:
- Uses React Query for data fetching and caching
- Has a 5-minute stale time for efficient caching
- Returns typed multi-season athlete data

### UI Components

The `AnalyticsPage.tsx` was updated to:
1. Use the new hook to fetch multi-season athlete data
2. Update the career progress chart to display races from all seasons with:
   - Season-based coloring
   - Proper sorting by date across seasons
   - Reference lines for average and best pace
3. Update the athlete modal to display:
   - All-time best 5K time from any season
   - Total races across all seasons
   - Season count information

## Type Handling

A `CommonRace` interface was created to handle the differences between:
- Single-season race data (`RacePerformance` type)
- Multi-season race data from the new endpoint

This ensures type safety when working with race data from different sources.

## Fallback Mechanism

The implementation includes fallback to single-season data if multi-season data is unavailable, ensuring backward compatibility.

## Usage

To use multi-season data in a component:

```tsx
// Import the hook
import { useAthleteAllSeasons } from '../hooks/usePerformanceMetrics';

// In your component
const { data: athleteAllSeasons } = useAthleteAllSeasons(athleteId);

// Access the data
const allSeasons = athleteAllSeasons?.data?.seasons || [];
const totalRaces = allSeasons.reduce((total, season) => 
  total + (season.metrics.races?.length || 0), 0);
```
