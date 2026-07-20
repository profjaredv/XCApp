export interface RaceSplit {
  id: string;
  resultId: string;
  athleteId: string;
  raceId: string;
  teamId: string;
  mile1: number;
  mile2: number;
  mile3: number;
  twoMileTime: number;
  createdAt: string;
  updatedAt: string;
  athlete?: {
    id: string;
    name: string;
    gender: string;
    grade: number;
  };
  result?: {
    time: number;
    place: number;
  };
}

export interface SplitFormData {
  resultId: string;
  athleteId: string;
  raceId: string;
  athleteName: string;
  finishTime: number;
  mile1: string;
  mile2: string;
  mile3: string;
}

export interface SplitAnalysis {
  mile1Pace: number;
  mile2Pace: number;
  mile3Pace: number;
  evenness: number; // How even the splits are (lower is more even)
  fastestMile: 1 | 2 | 3;
  slowestMile: 1 | 2 | 3;
  negativeSplit: boolean; // Second half faster than first half
}
