import React from 'react';
import { Season, SeasonMode } from './types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';

interface SeasonModeSelectorProps {
  mode: SeasonMode;
  onModeChange: (mode: SeasonMode) => void;
  selectedSeason?: number;
  onSeasonChange?: (year: number) => void;
  className?: string;
  seasons?: Season[];
}

export const SeasonModeSelector: React.FC<SeasonModeSelectorProps> = ({
  mode,
  onModeChange,
  selectedSeason,
  onSeasonChange,
  className = '',
  seasons = [],
}) => {
  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <Button
          variant={mode === 'current' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('current')}
        >
          Current
        </Button>
        <Button
          variant={mode === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('all')}
        >
          All Seasons
        </Button>
        <Button
          variant={mode === 'historical' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('historical')}
        >
          Historical
        </Button>
      </div>
      
      {mode === 'historical' && onSeasonChange && (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedSeason?.toString() || ''}
            onValueChange={(value) => onSeasonChange(Number(value))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.year.toString()}>
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export default SeasonModeSelector;
