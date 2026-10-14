import React from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ChevronRight, Dumbbell, Settings2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useGroups, useXTrainingRoster } from '@/hooks/useGroups';
import { usePracticePlanRange } from '@/hooks/usePracticePlans';
import { groupService, type Group, type GroupType } from '@/api/groupService';
import GroupsPage from '../GroupsPage';
import { NextPageHeader } from '@/components/next/PageHeader';

// The Groups hub (docs/leadpack-new-ui-trial.md §4.3): this season's
// groups by type, each with today's status at a glance. Creating,
// assigning, sorting by pace and dynamic groups stay on the classic
// GroupsPage at /groups/manage — not rebuilt here.

const SECTIONS: { type: GroupType; label: string }[] = [
  { type: 'TRAINING', label: 'Training groups' },
  { type: 'CAPTAIN', label: 'Captain groups' },
  { type: 'CUSTOM', label: 'Other groups' },
];

const GroupsHubPage: React.FC = () => {
  const { currentUser } = useAuth();
  const isCoach = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'].includes(currentUser?.teamRole ?? '');
  // Athletes keep classic's own read-only "My group" view at this URL.
  if (!isCoach) return <GroupsPage />;
  return <CoachGroupsHub />;
};

const CoachGroupsHub: React.FC = () => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { currentUser } = useAuth();
  const { seasons, activeYear } = useSeasonSelection();
  const seasonId = seasons.find((s) => s.year === activeYear)?.id ?? null;
  const { data: groups = [], isLoading } = useGroups(seasonId);
  const { data: plans, isFetched: plansFetched } = usePracticePlanRange(seasonId, today, today);
  const { data: xt } = useXTrainingRoster(seasonId);
  const visible = groups.filter((g) => !g.archived && g.type !== 'X_TRAINING');
  const days = useQueries({
    queries: visible.map((g) => ({
      queryKey: ['groupDay', g.id, today],
      queryFn: () => groupService.getGroupDay(g.id, today),
    })),
  });
  const dayFor = (id: string) => days[visible.findIndex((g) => g.id === id)]?.data;
  const plan = plans?.[0];
  const isVolunteer = currentUser?.teamRole === 'VOLUNTEER_COACH';

  return (
    <div className="mx-auto max-w-5xl">
      <NextPageHeader
        title="Groups"
        subtitle={activeYear ? `${activeYear} season` : undefined}
        overflow={isVolunteer ? [] : [{ label: 'Manage groups', to: teamPath('/groups/manage'), icon: Settings2 }]}
      />

      {!seasonId ? (
        <p className="text-sm text-muted-foreground">This season has no groups set up — it predates group tracking for this team.</p>
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No groups this season yet.{' '}
          {!isVolunteer && (
            <Link to={teamPath('/groups/manage')} className="text-primary hover:underline">
              Create your first group
            </Link>
          )}
        </p>
      ) : (
        <div className="space-y-6">
          {(xt?.members.length ?? 0) > 0 && (
            <p className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
              <Dumbbell className="h-4 w-4" />
              {xt!.members.length} athlete{xt!.members.length === 1 ? '' : 's'} cross-training today
            </p>
          )}
          {SECTIONS.map(({ type, label }) => {
            const inSection = visible.filter((g) => g.type === type);
            if (inSection.length === 0) return null;
            return (
              <section key={type}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {inSection.map((g) => (
                    <GroupCard
                      key={g.id}
                      group={g}
                      to={teamPath(`/group/${g.id}`)}
                      attendance={statusOf(dayFor(g.id))}
                      plan={!plansFetched ? null : plan ? (plan.published ? 'published' : 'draft') : 'none'}
                      xTraining={xt?.members.filter((m) => m.trainingGroup?.id === g.id).length ?? 0}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

function statusOf(day: Awaited<ReturnType<typeof groupService.getGroupDay>> | undefined): 'taken' | 'not-taken' | 'off' | null {
  if (!day) return null;
  if (!day.attendanceEnabled) return 'off';
  const marked = day.members.length - day.counts.unmarked;
  return day.session && marked > 0 ? 'taken' : 'not-taken';
}

const GroupCard: React.FC<{
  group: Group;
  to: string;
  attendance: 'taken' | 'not-taken' | 'off' | null;
  plan: 'published' | 'draft' | 'none' | null;
  xTraining: number;
}> = ({ group, to, attendance, plan, xTraining }) => {
  const leaders = group.leaders.map((l) => l.name || l.email).join(', ');
  return (
    <Link to={to} className="block">
      <Card className="flex min-h-12 items-center gap-3 p-4 transition-colors hover:bg-accent/50">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{group.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {group.activeMemberCount} athlete{group.activeMemberCount === 1 ? '' : 's'}
            {leaders ? ` · ${leaders}` : ' · no leader'}
          </p>
          <p className="mt-1 text-xs">
            {attendance !== 'off' && (
              <span className={attendance === 'taken' ? 'text-primary' : 'text-muted-foreground'}>
                Attendance {attendance === 'taken' ? '✓' : attendance === null ? '…' : '–'}
              </span>
            )}
            {attendance !== 'off' && ' · '}
            <span className={plan === 'published' ? 'text-primary' : 'text-muted-foreground'}>
              Plan {plan === 'published' ? '✓' : plan === null ? '…' : '–'}
            </span>
            {xTraining > 0 && <span className="text-orange-700 dark:text-orange-400"> · {xTraining} cross-training</span>}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
};

export default GroupsHubPage;
