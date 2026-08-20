import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, RefreshCw, MoreVertical } from 'lucide-react';
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
}: AnalyticsHeaderProps) => {
  // Backend only ever lets HEAD_COACH (or an impersonating super admin)
  // actually clear team data (routes/teams.js) — this just keeps the
  // button from being shown to everyone else in the first place, rather
  // than letting them find out via a 403 after clicking.
  const canClearData = currentUser?.isSuperAdmin || currentUser?.teamRole === 'HEAD_COACH';
  // Recalculate/Clear Data are rare admin actions, not something a coach
  // needs on every visit — stacked full-width with the season controls on
  // mobile (flex-col below sm:), they used to push the actual page content
  // (Meets list, etc.) below the fold. Collapsed behind a toggle on mobile
  // only; desktop keeps them inline as before.
  const [showDataActions, setShowDataActions] = useState(false);

  const dataActionButtons = (
    <>
      <Button variant="outline" size="sm" onClick={handleRecalculateMetrics} disabled={isRecalculating || !team} title={!team ? 'Team ID unavailable' : undefined}>
        <RefreshCw className={`h-4 w-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
        {isRecalculating ? 'Recalculating…' : 'Recalculate Metrics'}
      </Button>
      {canClearData && (
        <Button variant="destructive" size="sm" onClick={handleClearTeamData}>Clear Team Data</Button>
      )}
    </>
  );

  // No team-name heading or "which year" summary line here anymore —
  // Layout's persistent header already shows both on every screen now, so
  // repeating them here was pure duplication ("Ellensburg High XC" twice,
  // the year mentioned three times over). What's genuinely specific to
  // Analytics stays: the current/historical mode toggle (a real behavior
  // switch, not just a year picker) and, only in historical mode, the
  // specific-year picker that mode needs.
  if (isLoadingSeasons || !availableSeasons || availableSeasons.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:justify-end items-center gap-2 sm:gap-3">
      <SeasonModeSelector mode={seasonMode} onModeChange={handleSeasonModeChange} />
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
      <div className="hidden sm:flex items-center gap-2">{dataActionButtons}</div>
      <div className="sm:hidden w-full">
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowDataActions((v) => !v)}>
          <MoreVertical className="h-4 w-4 mr-1" />
          {showDataActions ? 'Hide data actions' : 'Data actions'}
        </Button>
        {showDataActions && (
          <div className="flex flex-col gap-2 mt-2">{dataActionButtons}</div>
        )}
      </div>
    </div>
  );
};
