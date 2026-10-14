import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Settings2, Users } from 'lucide-react';
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
import { Avatar, SegmentedTabs, Stat } from '@/components/next/Visual';

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
  const marked = day ? day.members.length - day.counts.unmarked : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <NextPageHeader
        title={group?.name ?? 'Group'}
        subtitle={group ? (leaders ? `Led by ${leaders}` : 'No leader yet') : undefined}
        overflow={isVolunteer ? [] : [{ label: 'Manage all groups', to: teamPath('/groups/manage'), icon: Settings2 }]}
      />
      {day && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Athletes" value={day.members.length} />
          <Stat
            label="Here today"
            value={day.session && marked > 0 ? day.counts.PRESENT + day.counts.LATE : '–'}
            sub={day.session && marked > 0 ? `of ${day.members.length}` : 'not taken'}
          />
          <Stat label="Sessions" value={day.intervalSessions.length} sub="today" />
        </div>
      )}
      <SegmentedTabs
        label="Group"
        tabs={TABS}
        value={tab}
        onChange={(k) => setParams(k === 'today' ? {} : { tab: k }, { replace: true })}
        className="mb-4"
      />
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
        <div className="rounded-3xl bg-card p-2 shadow-sm ring-1 ring-border/60">
          {members.map((m) => (
            <RowLink key={m.membershipId} to={teamPath(`/athlete/${m.athleteId}`)}>
              <Avatar name={m.name} />
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
              {m.grade != null && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{gradeLabelShort(m.grade)}</span>}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </RowLink>
          ))}
        </div>
      )}
      {open && <ManageMembersDialog group={group} seasonId={seasonId} onClose={() => setOpen(false)} roster={rows} allGroups={groups} />}
    </div>
  );
};

export default GroupPageNext;
