import React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, MoreVertical } from 'lucide-react';
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
  handleRecalculateMetrics: () => void;
  isRecalculating: boolean;
  team: Team | undefined;
  handleClearTeamData: () => void;
  /** Actions contributed by whichever tab is open — the Results Grid's
   *  Export CSV, say. They belong in the same Data actions menu as
   *  Recalculate and Clear, not as a separate button competing with the
   *  page's own content. */
  extraActions?: React.ReactNode;
}

export const AnalyticsHeader = ({
  currentUser,
  isLoadingSeasons,
  availableSeasons,
  handleRecalculateMetrics,
  isRecalculating,
  team,
  handleClearTeamData,
  extraActions,
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
      {extraActions}
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

  // Right-aligned on its own line, not centred mid-page. Centred, it read
  // as a heading for the content below it rather than a control belonging
  // to the page — and on a phone it sat between the tabs and the data with
  // nothing tying it to either.
  return (
    <div className="relative mb-4 flex justify-end">
      <div className="hidden sm:flex items-center gap-2">{dataActionButtons}</div>
      <div className="sm:hidden">
        <Button variant="ghost" size="sm" onClick={() => setShowDataActions((v) => !v)}>
          <MoreVertical className="mr-1 h-4 w-4" />
          {showDataActions ? 'Hide' : 'Actions'}
        </Button>
      </div>
      {showDataActions && (
        <div className="absolute right-4 z-20 mt-10 flex flex-col gap-2 rounded-lg border bg-background p-2 shadow-lg sm:hidden">
          {dataActionButtons}
        </div>
      )}
    </div>
  );
};
