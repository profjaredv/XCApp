import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useGroupDay, useGroupMembers, useGroups, useRosterWithRaces } from '@/hooks/useGroups';
import { averagePaceSecPerMile, seasonBestTime } from '@/api/groupService';
import GroupDayPage from '../GroupDayPage';
import { GroupAnalyticsTab } from '@/components/analytics/GroupAnalyticsTab';
import { ManageMembersDialog, type AthleteRow } from '@/components/groups/ManageMembersDialog';
import { NextPageHeader, RowLink } from '@/components/next/PageHeader';
import { gradeLabelShort } from '@/lib/seasonUtils';
import { cn } from '@/lib/utils';

// One group (docs/leadpack-new-ui-trial.md §4.3): Today (the classic
// GroupDayPage, embedded — attendance, sessions, cross-training, the date
// navigator), Trends (Season's By Group view pinned to this group), and
// Members (the classic member management dialog).

type Tab = 'today' | 'trends' | 'members';
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'trends', label: 'Trends' },
  { key: 'members', label: 'Members' },
];

const GroupPageNext: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'today') as Tab;
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { currentUser } = useAuth();
  const { data: day } = useGroupDay(groupId ?? null, today);
  const group = day?.group;
  const leaders = group?.leaders.map((l) => l.name || l.email).join(', ');
  const isVolunteer = currentUser?.teamRole === 'VOLUNTEER_COACH';

  return (
    <div className="mx-auto max-w-5xl">
      <NextPageHeader
        title={group?.name ?? 'Group'}
        subtitle={group ? `${day!.members.length} athlete${day!.members.length === 1 ? '' : 's'}${leaders ? ` · ${leaders}` : ''}` : undefined}
        overflow={isVolunteer ? [] : [{ label: 'Manage all groups', to: teamPath('/groups/manage'), icon: Settings2 }]}
      />
      <div role="tablist" aria-label="Group" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'today' ? {} : { tab: t.key }, { replace: true })}
            className={cn(
              'min-h-12 border-b-2 px-4 text-sm font-medium',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'today' && <GroupDayPage embedded />}
      {tab === 'trends' && group && <GroupAnalyticsTab groupSeasonId={group.seasonId} groupIds={[group.id]} />}
      {tab === 'members' && group && <MembersTab groupId={group.id} seasonId={group.seasonId} season={group.season} />}
    </div>
  );
};

const MembersTab: React.FC<{ groupId: string; seasonId: string; season: number }> = ({ groupId, seasonId, season }) => {
  const teamPath = useTeamPath();
  const { currentUser } = useAuth();
  const { data: members = [], isLoading } = useGroupMembers(groupId);
  const { data: groups = [] } = useGroups(seasonId);
  const [open, setOpen] = useState(false);
  const { data: roster = [] } = useRosterWithRaces(open ? season : undefined);
  const group = groups.find((g) => g.id === groupId) ?? null;
  // Volunteers can't change membership (server: FULL_COACH), so no button.
  const canManage = ['HEAD_COACH', 'COACH'].includes(currentUser?.teamRole ?? '');
  const rows: AthleteRow[] = roster.map((a) => ({
    id: a.id,
    name: a.preferredName || a.name,
    gender: a.gender,
    grade: a.grade,
    bestTime: seasonBestTime(a),
    avgPaceSecPerMile: averagePaceSecPerMile(a),
  }));

  return (
    <div className="space-y-3">
      {canManage && (
        <Button variant="outline" className="min-h-12 lg:min-h-10" onClick={() => setOpen(true)}>
          <Users className="mr-2 h-4 w-4" />
          Add, move or remove athletes
        </Button>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is in this group yet.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {members.map((m) => (
            <RowLink key={m.membershipId} to={teamPath(`/athlete/${m.athleteId}`)}>
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
              {m.grade != null && <span className="text-xs text-muted-foreground">{gradeLabelShort(m.grade)}</span>}
            </RowLink>
          ))}
        </div>
      )}
      {open && <ManageMembersDialog group={group} seasonId={seasonId} onClose={() => setOpen(false)} roster={rows} allGroups={groups} />}
    </div>
  );
};

export default GroupPageNext;
