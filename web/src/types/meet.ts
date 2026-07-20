export interface Meet {
  id: string;
  name: string;
  date: string;
  location?: string;
  distance?: number;
  season: number;
  team: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Race {
  id: string;
  meetId: string;
  athleteId: string;
  athleteName: string;
  time: number;
  place?: number;
  gender?: 'M' | 'F' | 'O';
  team: string;
  distance?: number;
}
