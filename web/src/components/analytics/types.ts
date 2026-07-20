export type SeasonMode = 'current' | 'all' | 'historical';

export interface Season {
  id: string;
  year: number;
  name: string;
  isCurrent: boolean;
}

export interface SeasonModeSelectorProps {
  mode: SeasonMode;
  onModeChange: (mode: SeasonMode) => void;
  selectedSeason?: number;
  onSeasonChange?: (year: number) => void;
  className?: string;
  seasons?: Season[];
}
