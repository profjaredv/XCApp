import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, RefreshCw } from 'lucide-react';
import { SeasonModeSelector } from './SeasonModeSelector';
import { SeasonMode } from './types';
import type { User } from '@/types';
import type { TeamPerformance } from '@/types/analytics';

interface Season {
  year: number;
}

export interface Team {
  overview: TeamPerformance;
  men: TeamPerformance;
  women: TeamPerformance;
}

interface AnalyticsHeaderProps {
  currentUser: User | null;
  isLoadingSeasons: boolean;
  availableSeasons: Season[];
  seasonMode: SeasonMode;
  handleSeasonModeChange: (mode: SeasonMode) => void;
  selectedSeason?: number;
  setSelectedSeason: (year: number) => void;
  activeSeason?: number;
  handleRecalculateMetrics: () => void;
  isRecalculating: boolean;
  team: Team | undefined;
  handleClearTeamData: () => void;
  seasonDisplay: string;
}

export const AnalyticsHeader = ({
  currentUser,
  isLoadingSeasons,
  availableSeasons,
  seasonMode,
  handleSeasonModeChange,
  selectedSeason,
  setSelectedSeason,
  activeSeason,
  handleRecalculateMetrics,
  isRecalculating,
  team,
  handleClearTeamData,
  seasonDisplay
}: AnalyticsHeaderProps) => {
  // Backend only ever lets HEAD_COACH (or an impersonating super admin)
  // actually clear team data (routes/teams.js) — this just keeps the
  // button from being shown to everyone else in the first place, rather
  // than letting them find out via a 403 after clicking.
  const canClearData = currentUser?.isSuperAdmin || currentUser?.teamRole === 'HEAD_COACH';
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h1 className="text-3xl font-bold tracking-tight">{currentUser?.team?.name || 'Team Analytics'}</h1>
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {!isLoadingSeasons && availableSeasons && availableSeasons.length > 0 && (
            <>
              <SeasonModeSelector
                mode={seasonMode}
                onModeChange={handleSeasonModeChange}
                className="mb-2 sm:mb-0"
              />
              {seasonMode === 'historical' && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <Select value={selectedSeason?.toString()} onValueChange={(v) => setSelectedSeason(Number(v))}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select season" /></SelectTrigger>
                    <SelectContent>
                      {availableSeasons.map((s) => (
                        <SelectItem key={s.year} value={s.year.toString()}>{s.year} Cross{s.year === activeSeason ? ' (Current)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleRecalculateMetrics} disabled={isRecalculating || !team} title={!team ? 'Team ID unavailable' : undefined}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                {isRecalculating ? 'Recalculating…' : 'Recalculate Metrics'}
              </Button>
              {canClearData && (
                <Button variant="destructive" size="sm" onClick={handleClearTeamData}>Clear Team Data</Button>
              )}
            </>
          )}
          {/* Enhanced Analytics now integrated as tabs - no separate page needed */}
        </div>
      </div>
      <p className="text-lg text-muted-foreground text-center sm:text-left">{seasonDisplay}</p>
    </div>
  );
};
