import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, ClipboardCheck, Compass, Gauge, History, Pencil, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { TrainingPacesCard } from '@/components/TrainingPacesCard';
import { TrainingLogCard } from '@/components/training/TrainingLogCard';
import { NextPageHeader } from '@/components/next/PageHeader';

// Train (docs/leadpack-new-ui-trial.md §4.2): the practice side, for every
// role. Coaches get today's sessions per scoped group, the week (Schedule's
// own week/agenda views, embedded), and the tools; athletes get today's
// workout, their paces, their log and their strategy.

const ToolRow: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; to?: string; onClick?: () => void }> = ({
  icon: Icon,
  label,
  to,
  onClick,
}) => {
  const cls = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent';
  const body = (
    <>
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
};

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
  const line = 'flex min-h-12 items-center gap-3 border-t py-1 text-sm first:border-t-0';
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1">
        <CardTitle className="text-base">
          <Link to={teamPath(`/group/${group.id}`)} className="hover:underline">
            {group.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!day ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div>
            <div className={line}>
              <span className="w-24 shrink-0 text-muted-foreground">Practice</span>
              <span className="min-w-0 flex-1 truncate">
                {!planLoaded ? '…' : !plan ? 'No plan yet' : plan.published ? 'Published' : 'Draft — athletes can’t see it'}
              </span>
              <button type="button" onClick={onPlan} className="shrink-0 font-medium text-primary">
                {plan ? 'Edit' : 'Plan'}
              </button>
            </div>
            {day.attendanceEnabled && (
              <div className={line}>
                <span className="w-24 shrink-0 text-muted-foreground">Attendance</span>
                <span className="min-w-0 flex-1 truncate">
                  {taken ? `${day.counts.PRESENT + day.counts.LATE} of ${day.members.length} here` : 'Not taken'}
                </span>
                <Link to={teamPath(`/group/${group.id}`)} className="shrink-0 font-medium text-primary">
                  {taken ? 'Open' : 'Take'}
                </Link>
              </div>
            )}
            <div className={line}>
              <span className="w-24 shrink-0 text-muted-foreground">Session</span>
              <span className="min-w-0 flex-1 truncate">{day.intervalSessions[0]?.title ?? 'None today'}</span>
              <Link
                to={teamPath(day.intervalSessions[0] ? `/interval-sessions/${day.intervalSessions[0].id}` : '/interval-sessions')}
                className="shrink-0 font-medium text-primary"
              >
                {day.intervalSessions[0] ? 'Start' : 'New'}
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
          <Button onClick={() => setNewPlanSignal((n) => n + 1)} className="min-h-12 lg:min-h-10">
            <Plus className="mr-1 h-4 w-4" />
            New practice plan
          </Button>
        }
        overflow={[{ label: 'Full schedule, import & export', to: teamPath('/schedule'), icon: CalendarDays }]}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today's sessions</h2>
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

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">This week</h2>
        <SchedulePage
          embedded
          viewModes={['week', 'agenda']}
          initialViewMode="week"
          newPlanSignal={newPlanSignal}
          templatesSignal={templatesSignal}
        />
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Tools</CardTitle>
          </CardHeader>
          <CardContent className="-mx-3 px-3">
            <ToolRow icon={Pencil} label="Workout templates" onClick={() => setTemplatesSignal((n) => n + 1)} />
            <ToolRow icon={Gauge} label="Pace calculator" to={teamPath('/tools')} />
            <ToolRow icon={History} label="Interval sessions" to={teamPath('/interval-sessions')} />
            {attendanceOn && <ToolRow icon={ClipboardCheck} label="Attendance history" to={teamPath('/attendance')} />}
          </CardContent>
        </Card>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today's workout</CardTitle>
            {groupNames.length > 0 && <p className="text-xs text-muted-foreground">{groupNames.join(' · ')}</p>}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : planData?.plan ? (
              <PracticePlanPreview plan={planData.plan} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing posted for today yet.</p>
            )}
          </CardContent>
        </Card>
        <TrainingPacesCard recentRaces={recentRaces} />
        <TrainingLogCard />
        <Card>
          <CardContent className="py-3">
            <ToolRow icon={Compass} label="Race strategy — where are the next 20 seconds?" to={teamPath(`/athlete/${athleteId}/strategy`)} />
          </CardContent>
        </Card>
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
