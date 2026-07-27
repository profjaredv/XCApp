import React from 'react';
import { SeasonMode } from './types';
import { Button } from '@/components/ui/button';

interface SeasonModeSelectorProps {
  mode: SeasonMode;
  onModeChange: (mode: SeasonMode) => void;
  className?: string;
}

// Just the current/historical toggle. The "which past season" dropdown that
// appears once historical mode is picked lives in AnalyticsHeader, the only
// consumer of this component — it used to be duplicated here too (two
// identical "Select season" pickers rendered side by side).
export const SeasonModeSelector: React.FC<SeasonModeSelectorProps> = ({
  mode,
  onModeChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Button
        variant={mode === 'current' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('current')}
      >
        Current Season
      </Button>
      <Button
        variant={mode === 'historical' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('historical')}
      >
        Past Seasons
      </Button>
    </div>
  );
};

export default SeasonModeSelector;
