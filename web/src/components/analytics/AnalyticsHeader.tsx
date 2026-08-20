import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, MoreVertical } from 'lucide-react';
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

  // No team-name heading, "which year" summary line, or year picker here
  // anymore — Layout's persistent header already shows the team name and
  // lets you pick a year on every screen now (the two are wired together:
  // see AnalyticsPage.tsx's two-way SeasonContext sync), so repeating any
  // of it here was pure duplication that could also drift out of sync
  // with the real selection. What's genuinely specific to Analytics stays:
  // the current/historical mode toggle, a real behavior switch, not just
  // another copy of "which year."
  if (isLoadingSeasons || !availableSeasons || availableSeasons.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:justify-end items-center gap-2 sm:gap-3">
      <SeasonModeSelector mode={seasonMode} onModeChange={handleSeasonModeChange} />
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
