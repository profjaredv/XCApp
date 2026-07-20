// Team performance data from the API
export interface TeamPerformance {
  id: string;
  name: string;
  totalRaces?: number;
  totalMiles?: number;
  avgMilePace?: number;
  improvementPercent?: number;
  meetCount?: number;
  totalRunners?: number;
  firstMeet?: {
    name: string;
    date: string;
    avgPace: number;
  };
  lastMeet?: {
    name: string;
    date: string;
    avgPace: number;
  };
}

// Team data structure used in the analytics page
export interface TeamData {
  overview: TeamPerformance;
  men: TeamPerformance;
  women: TeamPerformance;
}
