# Race Comparison - Final Design

## Overview

Two-mode comparison system:
1. **Team Performance at Meets** (Default) - Compare team performance at recurring meets across seasons
2. **Individual Athlete Progression** (Optional) - Track individual athlete development across seasons

---

## Mode 1: Team Performance at Meets

### **User Flow:**
1. View list of meets that appear in 2+ seasons
2. Select a meet (e.g., "Fort Steilacoom Invitational")
3. See team performance at that meet across all seasons

### **Data Displayed:**
For each season the team attended that meet:
- **Boys Team**:
  - Average finish time
  - Average pace (per mile)
  - Number of runners
  - Best time
- **Girls Team**:
  - Average finish time
  - Average pace (per mile)
  - Number of runners
  - Best time
- **Overall Team**:
  - Average finish time
  - Average pace (per mile)
  - Total runners
  - Best time

### **Visualizations:**
- Line chart: Average pace progression (Boys, Girls, Team)
- Line chart: Average finish time progression
- Table: Season-by-season breakdown

### **Backend Endpoints:**

#### 1. Get Multi-Season Meets
```
GET /api/enhanced-performance/multi-season-meets/:teamId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "meetName": "Fort Steilacoom Invitational",
      "seasons": [2023, 2024, 2025],
      "raceIds": [
        { "id": "race-uuid-1", "season": 2023 },
        { "id": "race-uuid-2", "season": 2024 },
        { "id": "race-uuid-3", "season": 2025 }
      ]
    }
  ]
}
```

#### 2. Get Meet Comparison Details
```
GET /api/enhanced-performance/meet-comparison/:teamId/:meetName
```

**Response:**
```json
{
  "success": true,
  "data": {
    "meetName": "Fort Steilacoom Invitational",
    "seasons": [
      {
        "season": 2023,
        "raceDate": "2023-09-15",
        "boys": {
          "count": 7,
          "avgTime": 1100,
          "avgPace": 354,
          "bestTime": 1050
        },
        "girls": {
          "count": 5,
          "avgTime": 1200,
          "avgPace": 386,
          "bestTime": 1150
        },
        "team": {
          "count": 12,
          "avgTime": 1145,
          "avgPace": 368,
          "bestTime": 1050
        }
      },
      {
        "season": 2024,
        "raceDate": "2024-09-14",
        "boys": {
          "count": 8,
          "avgTime": 1080,
          "avgPace": 347,
          "bestTime": 1030
        },
        "girls": {
          "count": 6,
          "avgTime": 1180,
          "avgPace": 379,
          "bestTime": 1130
        },
        "team": {
          "count": 14,
          "avgTime": 1125,
          "avgPace": 362,
          "bestTime": 1030
        }
      }
    ]
  }
}
```

---

## Mode 2: Individual Athlete Progression

### **User Flow:**
1. Click "View Athlete Progression" or similar toggle
2. Select an athlete from dropdown
3. See their performance progression across all seasons they competed

### **Data Displayed:**
For each season the athlete competed:
- Season year
- Grade during that season
- Number of races
- Average finish time
- Average pace
- Best 5K time
- Improvement from previous season

### **Visualizations:**
- Line chart: Best time progression by season
- Line chart: Average pace progression
- Cards: Season-by-season stats

### **Backend Endpoint:**

#### Get Athlete Multi-Season Stats
```
GET /api/enhanced-performance/athlete-progression/:athleteId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "athleteId": "uuid",
    "athleteName": "John Doe",
    "gender": "M",
    "currentGrade": 12,
    "seasons": [
      {
        "season": 2023,
        "grade": "10",
        "raceCount": 7,
        "avgTime": 1100,
        "avgPace": 354,
        "bestTime": 1050
      },
      {
        "season": 2024,
        "grade": "11",
        "raceCount": 8,
        "avgTime": 1080,
        "avgPace": 347,
        "bestTime": 1030,
        "timeImprovement": -20
      },
      {
        "season": 2025,
        "grade": "12",
        "raceCount": 6,
        "avgTime": 1060,
        "avgPace": 341,
        "bestTime": 1010,
        "timeImprovement": -20
      }
    ]
  }
}
```

---

## Frontend Component Structure

### **RaceComparisonTab.tsx**

```tsx
<RaceComparisonTab>
  {/* Mode Toggle */}
  <Tabs defaultValue="team">
    <TabsList>
      <TabsTrigger value="team">Team at Meets</TabsTrigger>
      <TabsTrigger value="athlete">Athlete Progression</TabsTrigger>
    </TabsList>
    
    {/* Team Mode */}
    <TabsContent value="team">
      {/* Step 1: Select Meet */}
      <Select onChange={setSelectedMeet}>
        {multiSeasonMeets.map(meet => (
          <SelectItem value={meet.meetName}>
            {meet.meetName} ({meet.seasons.join(', ')})
          </SelectItem>
        ))}
      </Select>
      
      {/* Step 2: Show Comparison */}
      {selectedMeet && (
        <MeetComparisonView 
          meetName={selectedMeet}
          data={meetComparisonData}
        />
      )}
    </TabsContent>
    
    {/* Athlete Mode */}
    <TabsContent value="athlete">
      {/* Step 1: Select Athlete */}
      <Select onChange={setSelectedAthlete}>
        {athletes.map(athlete => (
          <SelectItem value={athlete.id}>
            {athlete.name}
          </SelectItem>
        ))}
      </Select>
      
      {/* Step 2: Show Progression */}
      {selectedAthlete && (
        <AthleteProgressionView 
          athlete={selectedAthlete}
          data={athleteProgressionData}
        />
      )}
    </TabsContent>
  </Tabs>
</RaceComparisonTab>
```

---

## Implementation Status

### ✅ Completed:
1. Backend endpoint for multi-season meets list
2. Backend endpoint for meet comparison with gender breakdown
3. TypeScript types updated

### 🔄 In Progress:
1. Frontend component redesign
2. Athlete progression endpoint
3. Charts and visualizations

### ⏳ TODO:
1. Add distance-specific filtering (5K vs 3K)
2. Add export functionality
3. Add improvement indicators (green/red arrows)
4. Add season-over-season comparison percentages

---

## Key Features

### **Team Mode:**
- ✅ Shows recurring meets only (2+ seasons)
- ✅ Gender breakdown (Boys, Girls, Team)
- ✅ Average pace and finish time
- ✅ Historical comparison

### **Athlete Mode:**
- ✅ Multi-season progression
- ✅ Grade-by-grade tracking
- ✅ Improvement calculations
- ✅ Best time tracking

---

## Use Cases

### **For Coaches:**
1. **Team Mode**: "How has our team performed at Fort Steilacoom over the years?"
2. **Team Mode**: "Are our boys improving at this meet?"
3. **Athlete Mode**: "How has this senior progressed since freshman year?"
4. **Athlete Mode**: "Which athletes show consistent improvement?"

### **For Athletes:**
1. **Team Mode**: "How does our team compare to previous years?"
2. **Athlete Mode**: "How have I improved since last season?"

---

## Next Steps

1. **Deploy backend changes** ✅ (commit 16dce7c)
2. **Update frontend component** to use new endpoints
3. **Add athlete progression endpoint**
4. **Test with real data**
5. **Add polish** (loading states, error handling, empty states)

---

**Status**: Backend complete, frontend redesign in progress
**Deployment**: Backend deployed to Railway
**Next**: Update RaceComparisonTab.tsx to use new two-mode design
