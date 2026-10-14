import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, ClipboardCheck, Compass, Gauge, History, Pencil, Plus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { useMyGroups } from '@/hooks/useGroups';
import { useMyPracticePlan, usePracticePlanRange } from '@/hooks/usePracticePlans';
import { groupService, type Group, type GroupDay } from '@/api/groupService';
import { athleteService } from '@/api/athleteService';
import type { PracticePlan } from '@/api/practicePlanService';
import SchedulePage from '../SchedulePage';
import { PracticePlanPreview } from '@/components/practicePlans/PracticePlanPreview';
import { PacesPanel } from '@/components/next/PacesPanel';
import { TrainingLogCard } from '@/components/training/TrainingLogCard';
import { NextPageHeader } from '@/components/next/PageHeader';
import { Panel, PillLink, QuickAction, SectionHeading, StatusRow } from '@/components/next/Visual';

// Train (docs/leadpack-new-ui-trial.md §4.2): the practice side, for every
// role. Coaches get today's sessions per scoped group, the week (Schedule's
// own week/agenda views, embedded), and the tools; athletes get today's
// workout, their paces, their log and their strategy.

const SessionCard: React.FC<{
  group: Group;
  day: GroupDay | undefined;
  plan: PracticePlan | undefined;
  planLoaded: boolean;
  onPlan: () => void;
}> = ({ group, day, plan, planLoaded, onPlan }) => {
  const teamPath = useTeamPath();
  const marked = day ? day.members.length - day.counts.unmarked : 0;
  const taken = !!day?.session && marked > 0;
  const session = day?.intervalSessions[0];
  return (
    <Panel
      title={group.name}
      action={
        <Link to={teamPath(`/group/${group.id}`)} className="text-xs font-medium text-primary">
          Open group
        </Link>
      }
    >
      {!day ? (
        <Skeleton className="h-36 w-full rounded-2xl" />
      ) : (
        <div className="divide-y divide-border/60">
          <StatusRow
            icon={CalendarDays}
            state={!planLoaded || !plan ? 'todo' : plan.published ? 'done' : 'warn'}
            label="Practice"
            value={!planLoaded ? '…' : !plan ? 'No plan yet' : plan.published ? 'Published' : 'Draft, athletes can’t see it'}
            action={<PillLink onClick={onPlan} strong={!plan}>{plan ? 'Edit' : 'Plan'}</PillLink>}
          />
          {day.attendanceEnabled && (
            <StatusRow
              icon={ClipboardCheck}
              state={taken ? 'done' : 'todo'}
              label="Attendance"
              value={taken ? `${day.counts.PRESENT + day.counts.LATE} of ${day.members.length} here` : 'Not taken'}
              action={
                <PillLink to={teamPath(`/group/${group.id}`)} strong={!taken}>
                  {taken ? 'Open' : 'Take'}
                </PillLink>
              }
            />
          )}
          <StatusRow
            icon={Timer}
            state={session ? 'done' : 'todo'}
            label="Interval session"
            value={session?.title ?? 'None today'}
            action={
              <PillLink to={teamPath(session ? `/interval-sessions/${session.id}` : '/interval-sessions')}>{session ? 'Start' : 'New'}</PillLink>
            }
          />
        </div>
      )}
    </Panel>
  );
};

const CoachTrain: React.FC = () => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const scope = useGroupScope();
  const attendanceOn = useFeatureEnabled('attendance');
  const [newPlanSignal, setNewPlanSignal] = useState(0);
  const [templatesSignal, setTemplatesSignal] = useState(0);
  const { data: plans, isFetched: plansLoaded } = usePracticePlanRange(scope.seasonId, today, today);
  const days = useQueries({
    queries: scope.scopedGroups.map((g) => ({
      queryKey: ['groupDay', g.id, today],
      queryFn: () => groupService.getGroupDay(g.id, today),
    })),
  });

  return (
    <>
      <NextPageHeader
        title="Train"
        primary={
          <Button onClick={() => setNewPlanSignal((n) => n + 1)} aria-label="New practice plan" className="min-h-12 lg:min-h-10">
            <Plus className="mr-1 h-4 w-4" />
            New plan
          </Button>
        }
        overflow={[{ label: 'Full schedule, import & export', to: teamPath('/schedule'), icon: CalendarDays }]}
      />

      <section>
        <SectionHeading title="Today" />
        {scope.scopedGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {scope.isLoading ? 'Loading groups…' : 'No groups in this view yet. Groups are set up under Groups → Manage groups.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scope.scopedGroups.map((g, i) => (
              <SessionCard key={g.id} group={g} day={days[i]?.data} plan={plans?.[0]} planLoaded={plansLoaded} onPlan={() => setNewPlanSignal((n) => n + 1)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <SectionHeading title="Tools" />
        <div className="grid grid-cols-4 gap-1 md:max-w-xl">
          <QuickAction icon={Pencil} label="Templates" onClick={() => setTemplatesSignal((n) => n + 1)} />
          <QuickAction icon={Gauge} label="Paces" to={teamPath('/tools')} tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" />
          <QuickAction icon={History} label="Intervals" to={teamPath('/interval-sessions')} tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" />
          {attendanceOn && (
            <QuickAction icon={ClipboardCheck} label="Attendance" to={teamPath('/attendance')} tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" />
          )}
        </div>
      </section>

      <section className="mt-6">
        <SectionHeading title="This week" />
        <SchedulePage
          embedded
          viewModes={['week', 'agenda']}
          initialViewMode="week"
          newPlanSignal={newPlanSignal}
          templatesSignal={templatesSignal}
        />
      </section>

    </>
  );
};

const AthleteTrain: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { data: planData, isLoading } = useMyPracticePlan(today, true);
  const { data: myGroups } = useMyGroups();
  const { data: recentRaces = [] } = useQuery({
    queryKey: ['myRecentRaces', athleteId],
    queryFn: () => athleteService.getRecentRaces(athleteId, 10),
  });
  const groupNames = (myGroups ?? []).filter((g) => g.type !== 'X_TRAINING').map((g) => g.name);

  return (
    <>
      <NextPageHeader title="Train" />
      <div className="space-y-4">
        <Panel
          title="Today's workout"
          action={
            groupNames.length > 0 && (
              <span className="truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{groupNames.join(' · ')}</span>
            )
          }
        >
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : planData?.plan ? (
            <PracticePlanPreview plan={planData.plan} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing posted for today yet.</p>
          )}
        </Panel>
        <PacesPanel recentRaces={recentRaces} />
        <Link
          to={teamPath(`/athlete/${athleteId}/strategy`)}
          className="flex items-center gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60 hover:ring-primary/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            <Compass className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Race strategy</span>
            <span className="block truncate text-sm text-muted-foreground">Where are your next 20 seconds?</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
        <TrainingLogCard />
      </div>
    </>
  );
};

const TrainPage: React.FC = () => {
  const { currentUser } = useAuth();
  const isCoach = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'].includes(currentUser?.teamRole ?? '');
  return (
    <div className="mx-auto max-w-6xl">
      {isCoach ? (
        <CoachTrain />
      ) : currentUser?.linkedAthlete ? (
        <AthleteTrain athleteId={currentUser.linkedAthlete.id} />
      ) : (
        <>
          <NextPageHeader title="Train" />
          <p className="text-sm text-muted-foreground">Train shows your practice once your account is linked to an athlete on the roster.</p>
        </>
      )}
    </div>
  );
};

export default TrainPage;
