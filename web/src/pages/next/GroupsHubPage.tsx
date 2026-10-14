import React from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Check, ChevronRight, Dumbbell, Settings2 } from 'lucide-react';
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
import { ProgressRing, SectionHeading, Stat } from '@/components/next/Visual';
import { cn } from '@/lib/utils';

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
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Groups" value={visible.length} />
            <Stat
              label="Attendance"
              value={
                <>
                  {visible.filter((g) => statusOf(dayFor(g.id)) === 'taken').length}
                  <span className="text-base text-muted-foreground">/{visible.filter((g) => statusOf(dayFor(g.id)) !== 'off').length}</span>
                </>
              }
              sub="groups taken"
            />
            <Stat
              label="X-training"
              value={xt?.members.length ?? 0}
              sub="today"
              className={(xt?.members.length ?? 0) > 0 ? 'bg-orange-100 dark:bg-orange-950' : undefined}
            />
          </div>
          {SECTIONS.map(({ type, label }) => {
            const inSection = visible.filter((g) => g.type === type);
            if (inSection.length === 0) return null;
            return (
              <section key={type}>
                <SectionHeading title={label} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {inSection.map((g) => (
                    <GroupCard
                      key={g.id}
                      group={g}
                      to={teamPath(`/group/${g.id}`)}
                      attendance={statusOf(dayFor(g.id))}
                      here={(dayFor(g.id)?.counts.PRESENT ?? 0) + (dayFor(g.id)?.counts.LATE ?? 0)}
                      size={dayFor(g.id)?.members.length ?? g.activeMemberCount}
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

const Chip: React.FC<{ tone: 'good' | 'muted' | 'warn' | 'orange'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
      tone === 'good' && 'bg-primary/10 text-primary',
      tone === 'muted' && 'bg-muted text-muted-foreground',
      tone === 'warn' && 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
      tone === 'orange' && 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
    )}
  >
    {children}
  </span>
);

const GroupCard: React.FC<{
  group: Group;
  to: string;
  attendance: 'taken' | 'not-taken' | 'off' | null;
  here: number;
  size: number;
  plan: 'published' | 'draft' | 'none' | null;
  xTraining: number;
}> = ({ group, to, attendance, here, size, plan, xTraining }) => {
  const leaders = group.leaders.map((l) => l.name || l.email);
  return (
    <Link to={to} className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60 transition hover:ring-primary/40">
      <ProgressRing value={attendance === 'taken' ? here : 0} max={size} size={56} stroke={6} label={`${here} of ${size} here`}>
        <span className="text-sm font-bold tabular-nums">{size}</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{group.name}</p>
        <p className="truncate text-xs text-muted-foreground">{leaders.length ? leaders.join(', ') : 'No leader yet'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {attendance !== 'off' && (
            <Chip tone={attendance === 'taken' ? 'good' : 'muted'}>
              {attendance === 'taken' ? <Check className="h-3 w-3" /> : null}
              {attendance === 'taken' ? `${here}/${size} here` : attendance === null ? 'Attendance …' : 'Not taken'}
            </Chip>
          )}
          <Chip tone={plan === 'published' ? 'good' : plan === 'draft' ? 'warn' : 'muted'}>
            {plan === 'published' ? 'Plan ✓' : plan === 'draft' ? 'Plan draft' : plan === null ? 'Plan …' : 'No plan'}
          </Chip>
          {xTraining > 0 && (
            <Chip tone="orange">
              <Dumbbell className="h-3 w-3" />
              {xTraining} cross-training
            </Chip>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
};

export default GroupsHubPage;
