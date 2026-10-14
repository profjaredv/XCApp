import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ChevronRight, Flag, Gauge, Package, Trophy, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import { useOptionalSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTodayIso } from '@/hooks/useTodayIso';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { useMyGroups, useXTrainingRoster } from '@/hooks/useGroups';
import { useMyPracticePlan, usePracticePlanRange } from '@/hooks/usePracticePlans';
import { useMyMeetCard } from '@/hooks/useMeetOps';
import { todayService, type TodayAttentionItem } from '@/api/todayService';
import { groupService, type Group, type GroupDay } from '@/api/groupService';
import { groupAction } from '@/lib/todayNext';
import { meetOpsService } from '@/api/meetOpsService';
import { athleteService } from '@/api/athleteService';
import { raceReflectionService } from '@/api/raceReflectionService';
import { isFullCoach } from '@/lib/teamRole';
import { formatDateShort, formatTime } from '@/lib/formatUtils';
import { SetupChecklist } from '@/components/SetupChecklist';
import { SeasonReadinessChecklist } from '@/components/SeasonReadinessChecklist';
import { PracticePlanPreview } from '@/components/practicePlans/PracticePlanPreview';
import { RaceReflectionDialogBody } from '@/components/reflections/RaceReflectionDialogBody';
import { NextPageHeader } from '@/components/next/PageHeader';
import { Sheet, SheetContent, SheetRow } from '@/components/next/Sheet';

// Today in the "next" shell (docs/leadpack-new-ui-trial.md §4.1). Same
// /api/today endpoints and the same no-selectors rule as classic Today;
// what changes is what a coach sees first — their groups, and the one
// thing to do for each.

const Block: React.FC<{
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon: Icon, action, children }) => (
  <Card className="min-w-0">
    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </CardTitle>
      {action}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const Loading = () => (
  <div className="space-y-2">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);

function daysOutLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

const GroupStrip: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const scope = useGroupScope();
  const groups = scope.scopedGroups;
  const { data: plans, isLoading: planLoading } = usePracticePlanRange(seasonId, today, today);
  const { data: xt } = useXTrainingRoster(seasonId);
  const days = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['groupDay', g.id, today],
      queryFn: () => groupService.getGroupDay(g.id, today),
    })),
  });

  const plan = plans?.[0];
  const planLabel = planLoading ? null : !plan ? 'No plan yet' : plan.published ? 'Plan published' : 'Plan is a draft';

  return (
    <Block
      title={scope.scope === 'all' ? 'Groups' : scope.isVolunteer || groups.length > 1 ? 'My groups' : 'My group'}
      icon={Users}
      action={
        planLabel && (
          <Link to={teamPath('/train')} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {plan?.published ? '✓ ' : '– '}
            {planLabel}
          </Link>
        )
      }
    >
      {scope.isLoading && groups.length === 0 ? (
        <Loading />
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {scope.isVolunteer ? "You aren't leading a group this season yet." : 'No groups this season yet. '}
          {!scope.isVolunteer && (
            <Link to={teamPath('/groups/manage')} className="text-primary hover:underline">
              Set up groups
            </Link>
          )}
        </p>
      ) : (
        <ul className="divide-y">
          {groups.map((g, i) => (
            <GroupRow
              key={g.id}
              group={g}
              day={days[i]?.data}
              loading={days[i]?.isLoading}
              xTrainingCount={xt?.members.filter((m) => m.trainingGroup?.id === g.id).length ?? 0}
            />
          ))}
        </ul>
      )}
    </Block>
  );
};

const GroupRow: React.FC<{ group: Group; day: GroupDay | undefined; loading: boolean; xTrainingCount: number }> = ({
  group,
  day,
  loading,
  xTrainingCount,
}) => {
  const teamPath = useTeamPath();
  const action = groupAction(day, teamPath);
  const marked = day ? day.members.length - day.counts.unmarked : 0;
  const attendanceTaken = !!day?.session && marked > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <Link to={teamPath(`/group/${group.id}`)} className="min-w-0 flex-1 basis-40">
        <p className="truncate font-medium">{group.name}</p>
        <p className="text-xs text-muted-foreground">
          {loading || !day ? (
            '…'
          ) : (
            <>
              {day.attendanceEnabled && (attendanceTaken ? `Attendance ✓ ${day.counts.PRESENT + day.counts.LATE}/${day.members.length}` : 'Attendance –')}
              {day.attendanceEnabled && ' · '}
              {day.intervalSessions.length > 0 ? `Session: ${day.intervalSessions[0].title}` : 'No session'}
              {xTrainingCount > 0 && ` · ${xTrainingCount} cross-training`}
            </>
          )}
        </p>
      </Link>
      <Button asChild size="sm" variant={action.label === 'Open group' ? 'outline' : 'default'} className="min-h-12 w-full sm:min-h-9 sm:w-auto">
        <Link to={action.to || teamPath(`/group/${group.id}`)}>{action.label}</Link>
      </Button>
    </li>
  );
};

const NextMeetBlock: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const teamPath = useTeamPath();
  const { currentUser } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['today-meet', seasonId], queryFn: () => todayService.getMeet(seasonId) });
  const meet = data?.meet;
  // Only a full coach can set a race's distance, so only they get the nudge
  // (and the detail endpoint behind it is FULL_COACH).
  const canEdit = isFullCoach(currentUser);
  const { data: detail } = useQuery({
    queryKey: ['meetDetail', meet?.id],
    queryFn: () => meetOpsService.getMeet(meet!.id),
    enabled: !!meet && canEdit,
  });
  const missingDistance = detail && !detail.distance && detail.races.some((r) => !r.distance && !r.distanceMeters);

  return (
    <Block title="Next meet" icon={Flag}>
      {isLoading ? (
        <Loading />
      ) : !meet ? (
        <p className="text-sm text-muted-foreground">No meet on the schedule yet.</p>
      ) : (
        <Link to={teamPath(`/meet/${meet.id}`)} className="block space-y-1 rounded-lg hover:bg-accent/50">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-medium">{meet.name}</p>
            <Badge variant={meet.daysUntil <= 2 ? 'default' : 'secondary'}>{daysOutLabel(meet.daysUntil)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(meet.date)}
            {meet.location ? ` · ${meet.location}` : ''}
          </p>
          {missingDistance && (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Set the race distance so predictions work →</p>
          )}
        </Link>
      )}
    </Block>
  );
};

const ATTENTION_ICON: Record<TodayAttentionItem['type'], React.ComponentType<{ className?: string }>> = {
  splits: Flag,
  'unpublished-plan': CalendarDays,
  'overdue-equipment': Package,
};

const AttentionBlock: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const teamPath = useTeamPath();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['today-attention', seasonId],
    queryFn: () => todayService.getAttention(seasonId),
  });
  const items = data?.items ?? [];
  // Nothing qualifies → nothing rendered (§4.1).
  if (isLoading || isError || items.length === 0) return null;
  const linkFor = (item: TodayAttentionItem) =>
    item.type === 'splits' && item.link.raceId
      ? teamPath(`/race/${item.link.raceId}/splits`)
      : item.type === 'unpublished-plan'
      ? teamPath('/train')
      : teamPath('/equipment');
  return (
    <Block title="Needs attention" icon={AlertTriangle}>
      <ul className="-mx-3">
        {items.map((item, i) => {
          const Icon = ATTENTION_ICON[item.type];
          return (
            <li key={i}>
              <Link to={linkFor(item)} className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Block>
  );
};

const RecentResultBlock: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const teamPath = useTeamPath();
  const { data, isLoading } = useQuery({
    queryKey: ['today-recent-result', seasonId],
    queryFn: () => todayService.getRecentResult(seasonId),
  });
  const race = data?.race;
  return (
    <Block title="Recent result" icon={Trophy}>
      {isLoading ? (
        <Loading />
      ) : !race ? (
        <p className="text-sm text-muted-foreground">No races yet this season.</p>
      ) : (
        <Link to={teamPath('/meets')} className="block space-y-1">
          <p className="truncate font-medium">{race.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(race.date)} · {race.finisherCount} finishers
            {race.avgTimeSec != null ? ` · avg ${formatTime(race.avgTimeSec)}` : ''}
          </p>
        </Link>
      )}
    </Block>
  );
};

const CoachTodayNext: React.FC = () => {
  const teamPath = useTeamPath();
  const { data: seasonState, isLoading } = useQuery({ queryKey: ['today-season'], queryFn: () => todayService.getSeasonState() });

  if (isLoading || !seasonState) return <Loading />;
  if (seasonState.state === 'none') return <SetupChecklist />;
  if (seasonState.state === 'off-season') {
    const s = seasonState.lastSeasonSummary;
    return (
      <Block title="Off season" icon={CalendarDays}>
        <p className="mb-3 text-sm text-muted-foreground">
          {s ? `${s.year} season: ${s.rosterCount} athletes, ${s.raceCount} races.` : 'No completed season on record yet.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={teamPath('/band-trends')}>View Program</Link>
          </Button>
          <Button asChild>
            <Link to={teamPath('/settings#season-rollover')}>Start a new season</Link>
          </Button>
        </div>
      </Block>
    );
  }
  const seasonId = seasonState.season!.id;
  return (
    <div className="space-y-4">
      <SeasonReadinessChecklist />
      <GroupStrip seasonId={seasonId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <NextMeetBlock seasonId={seasonId} />
        <RecentResultBlock seasonId={seasonId} />
      </div>
      <AttentionBlock seasonId={seasonId} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Athlete
// ---------------------------------------------------------------------------

const AthleteTodayNext: React.FC<{ athleteId: string }> = ({ athleteId }) => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const reflectionsOn = useFeatureEnabled('reflections');
  const seasonSel = useOptionalSeasonSelection();
  const seasonId = seasonSel?.seasons.find((s) => s.year === seasonSel.activeSeason)?.id ?? null;
  const { data: planData, isLoading: planLoading } = useMyPracticePlan(today, true);
  const { data: myGroups } = useMyGroups();
  const { data: meetCard, isLoading: meetLoading } = useMyMeetCard(true);
  const { data: meets } = useQuery({
    queryKey: ['meetOps', seasonId],
    queryFn: () => meetOpsService.listMeets(seasonId!),
    enabled: !!seasonId && !!meetCard?.meet,
  });
  const { data: recent, isLoading: raceLoading } = useQuery({
    queryKey: ['myRecentRace', athleteId],
    queryFn: () => athleteService.getRecentRaces(athleteId, 1),
  });
  const lastRace = recent?.[0];

  const nextRaces = useMemo(
    () => meets?.find((m) => m.id === meetCard?.meet?.id)?.races ?? [],
    [meets, meetCard]
  );
  // Which of the next meet's races already have my goal — one small read
  // per race (a meet has a handful).
  const goals = useQueries({
    queries: nextRaces.map((r) => ({
      queryKey: ['myReflection', r.id],
      queryFn: () => raceReflectionService.getMine(r.id),
      enabled: reflectionsOn,
    })),
  });
  const goalSet = goals.some((q) => q.data?.reflection.preSubmittedAt);
  const allLocked = goals.length > 0 && goals.every((q) => q.data?.locked);
  const { data: lastReflection } = useQuery({
    queryKey: ['myReflection', lastRace?.raceId],
    queryFn: () => raceReflectionService.getMine(lastRace!.raceId),
    enabled: reflectionsOn && !!lastRace,
  });

  const [pickRace, setPickRace] = useState(false);
  const [reflect, setReflect] = useState<{ raceId: string; name: string; tab: 'pre' | 'post' } | null>(null);
  const openGoal = () => {
    if (nextRaces.length === 1) setReflect({ raceId: nextRaces[0].id, name: nextRaces[0].name, tab: 'pre' });
    else setPickRace(true);
  };

  const plan = planData?.plan;
  const groupNames = (myGroups ?? []).filter((g) => g.type !== 'X_TRAINING').map((g) => g.name);

  return (
    <div className="space-y-4">
      <Block title="Today's practice" icon={CalendarDays}>
        {groupNames.length > 0 && <p className="mb-2 text-xs font-medium text-muted-foreground">{groupNames.join(' · ')}</p>}
        {planLoading ? <Loading /> : !plan ? <p className="text-sm text-muted-foreground">Nothing posted for today yet.</p> : <PracticePlanPreview plan={plan} />}
      </Block>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Block title="Next meet" icon={Flag}>
          {meetLoading ? (
            <Loading />
          ) : !meetCard?.meet ? (
            <p className="text-sm text-muted-foreground">No meet on the schedule yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="truncate font-medium">{meetCard.meet.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateShort(meetCard.meet.date)}
                {meetCard.meet.location ? ` · ${meetCard.meet.location}` : ''}
              </p>
              {reflectionsOn && nextRaces.length > 0 && !allLocked && (
                goalSet ? (
                  <Button variant="outline" className="min-h-12 w-full sm:min-h-9 sm:w-auto" onClick={openGoal}>
                    Goal set · edit
                  </Button>
                ) : (
                  <Button className="min-h-12 w-full sm:min-h-9 sm:w-auto" onClick={openGoal}>
                    Set your goal
                  </Button>
                )
              )}
            </div>
          )}
        </Block>

        <Block title="Last race" icon={Gauge}>
          {raceLoading ? (
            <Loading />
          ) : !lastRace ? (
            <p className="text-sm text-muted-foreground">No races yet.</p>
          ) : (
            <div className="space-y-2">
              <Link to={teamPath('/me')} className="block">
                <p className="truncate font-medium">{lastRace.raceName}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateShort(lastRace.date)} · {formatTime(lastRace.time)}
                </p>
              </Link>
              {reflectionsOn && lastReflection && !lastReflection.reflection.postSubmittedAt && (
                <Button
                  className="min-h-12 w-full sm:min-h-9 sm:w-auto"
                  onClick={() => setReflect({ raceId: lastRace.raceId, name: lastRace.raceName, tab: 'post' })}
                >
                  Reflect on this race
                </Button>
              )}
            </div>
          )}
        </Block>
      </div>

      <Sheet open={pickRace} onOpenChange={setPickRace}>
        <SheetContent title="Which race are you running?">
          {nextRaces.map((r) => (
            <SheetRow
              key={r.id}
              onClick={() => {
                setPickRace(false);
                setReflect({ raceId: r.id, name: r.name, tab: 'pre' });
              }}
            >
              {r.name}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
      <Dialog open={!!reflect} onOpenChange={(o) => !o && setReflect(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reflect?.name ?? 'Race'}</DialogTitle>
            <DialogDescription>{reflect?.tab === 'pre' ? 'Your goals for this race.' : 'How did it go?'}</DialogDescription>
          </DialogHeader>
          {reflect && <RaceReflectionDialogBody raceId={reflect.raceId} initialTab={reflect.tab} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------

const TodayPageNext: React.FC = () => {
  const { currentUser } = useAuth();
  const isCoach = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'].includes(currentUser?.teamRole ?? '');
  return (
    <div className="mx-auto max-w-5xl">
      <NextPageHeader title="Today" subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
      {isCoach ? (
        <CoachTodayNext />
      ) : currentUser?.linkedAthlete ? (
        <AthleteTodayNext athleteId={currentUser.linkedAthlete.id} />
      ) : (
        <p className="text-sm text-muted-foreground">Your account isn't linked to an athlete or a coaching role on this team yet.</p>
      )}
    </div>
  );
};

export default TodayPageNext;
