import React from 'react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { useSeasons, Season } from '@/hooks/useSeasons';

export type SeasonMode = 'current' | 'historical';

interface SeasonModeSelectorProps {
  currentMode: SeasonMode;
  onModeChange: (mode: SeasonMode) => void;
  selectedSeason: number | null;
  onSeasonChange: (season: number) => void;
  className?: string;
}

export const SeasonModeSelector: React.FC<SeasonModeSelectorProps> = ({
  currentMode,
  onModeChange,
  // selectedSeason and onSeasonChange are not used in this component
  // but are passed through from parent components
  className = '',
}) => {
  return (
    <div className={`flex items-center ${className}`}>
      <Tabs 
        value={currentMode} 
        onValueChange={(value) => onModeChange(value as SeasonMode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="current">Current Season</TabsTrigger>
          <TabsTrigger value="historical">Historical Stats</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};

interface SeasonSelectorProps {
  selectedSeason: number | null;
  onSeasonChange: (season: number) => void;
  className?: string;
}

export const SeasonSelector: React.FC<SeasonSelectorProps> = ({
  selectedSeason,
  onSeasonChange,
  className = '',
}) => {
  const { data: seasons } = useSeasons();
  
  if (!seasons?.length) {
    return <div className="text-sm text-muted-foreground">No seasons available</div>;
  }
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {seasons.map((season: Season) => (
        <Button
          key={season.year}
          variant={selectedSeason === season.year ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSeasonChange(season.year)}
        >
          {season.year}
        </Button>
      ))}
    </div>
  );
};

export default SeasonModeSelector;
