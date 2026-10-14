import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { usePostseason } from '@/hooks/usePostseason';
import AnalyticsPage from '../AnalyticsPage';
import { NextPageHeader } from '@/components/next/PageHeader';

// Season (docs/leadpack-new-ui-trial.md §4.5): the existing Analytics
// tabs, as a visible tab row. Athletes moved to /athletes (§4.4), Meets to
// /meets (§4.6), the pace calculator to Train — a classic link to one of
// those tabs lands on its new home. Post Season shows only when this
// season has postseason races.

const MOVED: Record<string, string> = { athletes: '/athletes', meets: '/meets', tools: '/tools' };

const SeasonPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const { activeYear } = useSeasonSelection();
  const scope = useGroupScope();
  const { data: postseason } = usePostseason(activeYear ?? undefined);

  useEffect(() => {
    if (tab && MOVED[tab]) navigate(teamPath(MOVED[tab]), { replace: true });
  }, [tab, navigate, teamPath]);

  const tabs = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'performance', label: 'Performance' },
    { key: 'byGroup', label: 'Groups' },
    { key: 'resultsGrid', label: 'Results Grid' },
    { key: 'coach', label: 'Insights' },
    ...((postseason?.taggedRaceCount ?? 0) > 0 ? [{ key: 'postseason', label: 'Post Season', to: teamPath('/postseason') }] : []),
  ];
  // Don't mount Analytics on the way out — its URL sync would write
  // ?tab=&season= onto the page being redirected to.
  if (tab && MOVED[tab]) return null;

  const scopeIds = scope.enabled && scope.scope !== 'all' ? scope.scopedGroups.map((g) => g.id) : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <NextPageHeader title="Season" subtitle={activeYear ? `${activeYear}` : undefined} />
      <AnalyticsPage visibleTabs={tabs} groupScopeIds={scopeIds} />
    </div>
  );
};

export default SeasonPage;
