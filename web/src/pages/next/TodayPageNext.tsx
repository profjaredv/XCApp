import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ClipboardPaste, ChevronRight, ClipboardCheck, Compass, Dumbbell, Flag, Gauge, Package, Target, Timer, Trophy, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Sheet, SheetContent, SheetRow } from '@/components/next/Sheet';
import { DateTile, Hero, Panel, ProgressRing, QuickAction, SectionHeading, Stat } from '@/components/next/Visual';
import { greeting } from '@/lib/greeting';

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

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

// The hero: today's practice across the scoped groups — how many are
// here, the plan, and the one next thing to do.
const PracticeHero: React.FC<{ seasonId: string; groups: Group[]; days: (GroupDay | undefined)[]; loading: boolean }> = ({
  seasonId,
  groups,
  days,
  loading,
}) => {
  const teamPath = useTeamPath();
  const today = useTodayIso();
  const { data: plans } = usePracticePlanRange(seasonId, today, today);
  const plan = plans?.[0];
  const loaded = days.filter((d): d is GroupDay => !!d);
  const total = loaded.reduce((n, d) => n + d.members.length, 0);
  const here = loaded.reduce((n, d) => n + d.counts.PRESENT + d.counts.LATE, 0);
  const next = loaded.map((d) => groupAction(d, teamPath)).find((a) => a.label !== 'Open group');
  const planLine = plan ? [plan.run, plan.locationName, plan.startTime ? formatClock(plan.startTime) : null].filter(Boolean).join(' · ') : null;

  return (
    <Hero>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Practice today</p>
          <p className="mt-1 text-4xl font-bold tabular-nums leading-none">
            {loading ? '–' : here}
            <span className="text-xl font-semibold text-primary-foreground/60"> / {loading ? '–' : total}</span>
          </p>
          <p className="mt-1 text-sm text-primary-foreground/80">checked in{groups.length > 1 ? ` across ${groups.length} groups` : ''}</p>
        </div>
        <ProgressRing
          value={here}
          max={total}
          size={76}
          stroke={8}
          trackClassName="stroke-white/20"
          barClassName="stroke-white"
          label={`${here} of ${total} checked in`}
        >
          <span className="text-sm font-bold tabular-nums">{total ? Math.round((here / total) * 100) : 0}%</span>
        </ProgressRing>
      </div>
      <Link to={teamPath('/train')} className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-sm hover:bg-white/15">
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{plan ? planLine || 'Practice plan' : 'No practice plan yet'}</span>
        {plan && !plan.published && <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-950">Draft</span>}
        <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
      </Link>
      {next && (
        <Button asChild className="mt-3 min-h-12 w-full rounded-2xl bg-white text-base font-semibold text-primary hover:bg-white/90">
          <Link to={next.to}>
            {next.label === 'Take attendance' ? <ClipboardCheck className="mr-2 h-5 w-5" /> : <Timer className="mr-2 h-5 w-5" />}
            {next.label}
          </Link>
        </Button>
      )}
    </Hero>
  );
};

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// One tile per scoped group: an attendance ring and the day's session.
const GroupTiles: React.FC<{ groups: Group[]; days: (GroupDay | undefined)[]; xt: Record<string, number> }> = ({ groups, days, xt }) => {
  const teamPath = useTeamPath();
  const scope = useGroupScope();
  if (groups.length === 0) {
    return (
      <Panel title="Groups">
        <p className="text-sm text-muted-foreground">
          {scope.isVolunteer ? "You aren't leading a group this season yet." : 'No groups this season yet. '}
          {!scope.isVolunteer && (
            <Link to={teamPath('/groups/manage')} className="font-medium text-primary hover:underline">
              Set up groups
            </Link>
          )}
        </p>
      </Panel>
    );
  }
  return (
    <section className="min-w-0">
      <SectionHeading
        title={scope.scope === 'all' ? 'Groups' : groups.length > 1 ? 'My groups' : 'My group'}
        action={
          <Link to={teamPath('/groups')} className="text-xs font-medium text-primary">
            See all
          </Link>
        }
      />
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:px-0">
        {groups.map((g, i) => {
          const d = days[i];
          const here = d ? d.counts.PRESENT + d.counts.LATE : 0;
          const n = d?.members.length ?? 0;
          const taken = !!d?.session && !!d && n - d.counts.unmarked > 0;
          return (
            <Link
              key={g.id}
              to={teamPath(`/group/${g.id}`)}
              className="w-40 shrink-0 snap-start rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60 hover:ring-primary/40 md:w-auto"
            >
              <ProgressRing value={here} max={n} size={48} stroke={5} label={`${here} of ${n} here`}>
                <Users className="h-4 w-4 text-muted-foreground" />
              </ProgressRing>
              <p className="mt-3 truncate font-semibold">{g.name}</p>
              <p className="text-xs text-muted-foreground">
                {!d ? '…' : taken ? `${here}/${n} here` : `${n} athlete${n === 1 ? '' : 's'} · not taken`}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {[d?.intervalSessions[0] ? `⏱ ${d.intervalSessions[0].title}` : null, xt[g.id] ? `${xt[g.id]} cross-training` : null].filter(Boolean).join(' · ') || '\u00a0'}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
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
  const missingDistance = detail && !detail.distance && detail.races?.some((r) => !r.distance && !r.distanceMeters);

  return (
    <Panel title="Next meet" action={<Link to={teamPath('/meets')} className="text-xs font-medium text-primary">All meets</Link>}>
      {isLoading ? (
        <Loading />
      ) : !meet ? (
        <p className="text-sm text-muted-foreground">No meet on the schedule yet.</p>
      ) : (
        <>
          <Link to={teamPath(`/meet/${meet.id}`)} className="flex items-center gap-3">
            <DateTile date={meet.date} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{meet.name}</p>
              <p className="truncate text-sm text-muted-foreground">{meet.location || (meet.isHome ? 'Home' : 'Away')}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold tabular-nums leading-none">{meet.daysUntil}</p>
              <p className="text-[11px] text-muted-foreground">{meet.daysUntil === 1 ? 'day' : 'days'}</p>
            </div>
          </Link>
          {missingDistance && (
            <Link
              to={teamPath(`/meet/${meet.id}`)}
              className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">Set the race distance so predictions work</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </Link>
          )}
        </>
      )}
    </Panel>
  );
};

const ATTENTION_ICON: Record<TodayAttentionItem['type'], React.ComponentType<{ className?: string }>> = {
  splits: Flag,
  'unpublished-plan': CalendarDays,
  'overdue-equipment': Package,
  'update-results': ClipboardPaste,
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
    item.type === 'update-results'
      ? teamPath('/data-management')
      : item.type === 'splits' && item.link.raceId
      ? teamPath(`/race/${item.link.raceId}/splits`)
      : item.type === 'unpublished-plan'
      ? teamPath('/train')
      : teamPath('/equipment');
  return (
    <Panel
      title="Needs attention"
      action={<span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">{items.length}</span>}
    >
      <ul className="-mx-2">
        {items.map((item, i) => {
          // An item type this build doesn't know (the server can ship one before the page reloads)
          // gets a generic icon instead of crashing the whole screen.
          const Icon = ATTENTION_ICON[item.type] ?? AlertTriangle;
          return (
            <li key={i}>
              <Link to={linkFor(item)} className="flex min-h-12 items-center gap-3 rounded-2xl px-2 text-sm hover:bg-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
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
    <Panel title="Last race">
      {isLoading ? (
        <Loading />
      ) : !race ? (
        <p className="text-sm text-muted-foreground">No races yet this season.</p>
      ) : (
        <Link to={teamPath('/meets')} className="block">
          <p className="truncate text-sm text-muted-foreground">
            {race.name} · {formatDateShort(race.date)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="Team avg" value={race.avgTimeSec != null ? formatTime(race.avgTimeSec) : '—'} />
            <Stat label="Finishers" value={race.finisherCount} />
          </div>
        </Link>
      )}
    </Panel>
  );
};

const QuickActions: React.FC = () => {
  const teamPath = useTeamPath();
  return (
    <div className="grid grid-cols-4 gap-1">
      <QuickAction icon={Timer} label="Timer" to={teamPath('/interval-sessions')} />
      <QuickAction icon={CalendarDays} label="Plan" to={teamPath('/train')} tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" />
      <QuickAction icon={Trophy} label="Results" to={teamPath('/meets')} tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" />
      <QuickAction icon={Gauge} label="Season" to={teamPath('/season')} tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" />
    </div>
  );
};

const CoachDashboard: React.FC<{ seasonId: string }> = ({ seasonId }) => {
  const today = useTodayIso();
  const scope = useGroupScope();
  const groups = scope.scopedGroups;
  const { data: xtRoster } = useXTrainingRoster(seasonId);
  const days = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['groupDay', g.id, today],
      queryFn: () => groupService.getGroupDay(g.id, today),
    })),
  });
  const dayData = days.map((d) => d.data);
  const xt = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of xtRoster?.members ?? []) if (m.trainingGroup) out[m.trainingGroup.id] = (out[m.trainingGroup.id] ?? 0) + 1;
    return out;
  }, [xtRoster]);

  return (
    <div className="space-y-5">
      <SeasonReadinessChecklist />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <PracticeHero seasonId={seasonId} groups={groups} days={dayData} loading={scope.isLoading || days.some((d) => d.isLoading)} />
          <QuickActions />
        </div>
        <div className="space-y-5">
          <NextMeetBlock seasonId={seasonId} />
          <AttentionBlock seasonId={seasonId} />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GroupTiles groups={groups} days={dayData} xt={xt} />
        <RecentResultBlock seasonId={seasonId} />
      </div>
    </div>
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
  return <CoachDashboard seasonId={seasonState.season!.id} />;
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

  const meet = meetCard?.meet;
  const daysOut = meet ? Math.max(0, Math.round((Date.parse(meet.date.slice(0, 10)) - Date.parse(today)) / 86400000)) : null;
  const goalButton =
    reflectionsOn && nextRaces.length > 0 && !allLocked ? (
      <Button onClick={openGoal} className="mt-4 min-h-12 w-full rounded-2xl bg-white text-base font-semibold text-primary hover:bg-white/90">
        <Target className="mr-2 h-5 w-5" />
        {goalSet ? 'Goal set · edit' : 'Set your goal'}
      </Button>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {meetLoading ? (
            <Skeleton className="h-44 w-full rounded-3xl" />
          ) : meet ? (
            <Hero>
              <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Next race</p>
              <Link to={teamPath(`/meet/${meet.id}`)} className="mt-2 flex items-center gap-3">
                <DateTile date={meet.date} className="bg-white/15 text-primary-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold">{meet.name}</p>
                  <p className="truncate text-sm text-primary-foreground/80">{meet.location || (meet.isHome ? 'Home' : 'Away')}</p>
                </div>
                {daysOut != null && (
                  <div className="shrink-0 text-right">
                    <p className="text-4xl font-bold tabular-nums leading-none">{daysOut}</p>
                    <p className="text-[11px] text-primary-foreground/70">{daysOut === 1 ? 'day' : 'days'}</p>
                  </div>
                )}
              </Link>
              {goalButton}
            </Hero>
          ) : (
            <Panel title="Next race">
              <p className="text-sm text-muted-foreground">No meet on the schedule yet.</p>
            </Panel>
          )}
          <div className="grid grid-cols-4 gap-1">
            <QuickAction icon={Gauge} label="My season" to={teamPath('/me')} />
            <QuickAction icon={Dumbbell} label="Paces" to={teamPath('/train')} tone="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" />
            <QuickAction icon={Compass} label="Strategy" to={teamPath(`/athlete/${athleteId}/strategy`)} tone="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" />
            <QuickAction icon={Flag} label="Meets" to={teamPath('/meets')} tone="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" />
          </div>
        </div>

        <div className="space-y-5">
          <Panel
            title="Today's practice"
            action={
              groupNames.length > 0 && (
                <span className="truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{groupNames.join(' · ')}</span>
              )
            }
          >
            {planLoading ? <Loading /> : !plan ? <p className="text-sm text-muted-foreground">Nothing posted for today yet.</p> : <PracticePlanPreview plan={plan} />}
          </Panel>

          <Panel title="Last race">
            {raceLoading ? (
              <Loading />
            ) : !lastRace ? (
              <p className="text-sm text-muted-foreground">No races yet.</p>
            ) : (
              <>
                <Link to={teamPath('/me')} className="block">
                  <p className="text-4xl font-bold tabular-nums">{formatTime(lastRace.time)}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {lastRace.raceName} · {formatDateShort(lastRace.date)}
                  </p>
                </Link>
                {reflectionsOn && lastReflection && !lastReflection.reflection.postSubmittedAt && (
                  <Button
                    variant="outline"
                    className="mt-3 min-h-12 w-full"
                    onClick={() => setReflect({ raceId: lastRace.raceId, name: lastRace.raceName, tab: 'post' })}
                  >
                    Reflect on this race
                  </Button>
                )}
              </>
            )}
          </Panel>
        </div>
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
      <div className="mb-5 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">
          {greeting()}
          {currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}
        </h1>
      </div>
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
