import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarDays,
  Flag,
  AlertTriangle,
  Trophy,
  ArrowRight,
  Gauge,
  Package,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTeamContext } from '@/hooks/useTeamContext';
import { athleteService } from '@/api/athleteService';
import { todayService, type TodayAttentionItem } from '@/api/todayService';
import { useMyPracticePlan } from '@/hooks/usePracticePlans';
import { useMyMeetCard } from '@/hooks/useMeetOps';
import { useWeekPlans, useSetPublished, useDuplicateDay } from '@/hooks/usePracticePlans';
import { formatTime, formatDateShort } from '@/lib/formatUtils';
import { SetupChecklist } from '@/components/SetupChecklist';

// Workstream A (LeadPack Master Build Handoff): the index route under
// /t/:athleticTeamId. No season selector, no date picker, no filters —
// everything here derives from today's date and the signed-in user's role.
// If a control feels necessary, the answer is a link to the full page
// instead (see AGENTS/handoff doc, A1).

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Shared block shell: every block loads independently, gets its own skeleton,
// and degrades to a link (never a scary error message) on failure — A5.
// ---------------------------------------------------------------------------

interface BlockShellProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading: boolean;
  isError: boolean;
  linkTo: string;
  linkLabel: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

const BlockShell: React.FC<BlockShellProps> = ({ title, icon: Icon, isLoading, isError, linkTo, linkLabel, headerAction, children }) => (
  <Card className="min-w-0">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </CardTitle>
      {headerAction}
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError ? (
        <Link to={linkTo} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Couldn't load this here — open {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : (
        children
      )}
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Coach view blocks
// ---------------------------------------------------------------------------

const CoachPracticeBlock: React.FC<{ seasonId: string; teamPath: (p: string) => string }> = ({ seasonId, teamPath }) => {
  const today = todayIso();
  const yesterday = yesterdayIso();
  const { data: todayPlans, isLoading, isError } = useWeekPlans(seasonId, today, today);
  const { data: yesterdayPlans } = useWeekPlans(seasonId, yesterday, yesterday);
  const setPublished = useSetPublished(seasonId);
  const duplicateDay = useDuplicateDay(seasonId);

  const plan = todayPlans?.[0];
  const yesterdayPlan = yesterdayPlans?.[0];

  return (
    <BlockShell
      title="Today's practice"
      icon={CalendarDays}
      isLoading={isLoading}
      isError={isError}
      linkTo={teamPath('/practice-plans')}
      linkLabel="Practice Plans"
    >
      {!plan ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No practice plan for today yet.</p>
          <div className="flex flex-wrap gap-2">
            {yesterdayPlan && (
              <Button
                size="sm"
                variant="outline"
                disabled={duplicateDay.isPending}
                onClick={() => duplicateDay.mutate({ planId: yesterdayPlan.id, toDate: today, toSeasonId: seasonId })}
              >
                Duplicate yesterday
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to={teamPath('/practice-plans')}>Create from template</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!plan.published && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Draft — athletes cannot see this</span>
              <Button size="sm" variant="outline" onClick={() => setPublished.mutate({ planId: plan.id, published: true })} disabled={setPublished.isPending}>
                Publish
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {plan.assignments.length === 0 ? (
              <span className="text-sm text-muted-foreground">No group assignments yet.</span>
            ) : (
              plan.assignments.map((a) => (
                <Badge key={a.id} variant="secondary" className="font-normal">
                  {a.groupName}
                  {a.focus ? `: ${a.focus}` : ''}
                </Badge>
              ))
            )}
          </div>
          <Link to={teamPath('/practice-plans')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            View full plan <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </BlockShell>
  );
};

const CoachNextMeetBlock: React.FC<{ seasonId: string; teamPath: (p: string) => string }> = ({ seasonId, teamPath }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['today-meet', seasonId],
    queryFn: () => todayService.getMeet(seasonId),
  });
  const meet = data?.meet;

  return (
    <BlockShell title="Next meet" icon={Flag} isLoading={isLoading} isError={isError} linkTo={teamPath('/meets')} linkLabel="Meets">
      {!meet ? (
        <p className="text-sm text-muted-foreground">No upcoming meet scheduled.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium truncate">{meet.name}</p>
            <Badge variant={meet.daysUntil <= 2 ? 'default' : 'secondary'}>
              {meet.daysUntil === 0 ? 'Today' : meet.daysUntil === 1 ? 'Tomorrow' : `In ${meet.daysUntil} days`}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 text-sm text-muted-foreground">
            {meet.races.map((r) => (
              <span key={r.id} className="whitespace-nowrap">
                {r.name}: {r.enteredCount} entered
              </span>
            ))}
          </div>
          {!meet.planPublished && (
            <Badge variant="outline" className="font-normal">Logistics not published</Badge>
          )}
          <Link to={teamPath('/meets')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            Open Meets <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </BlockShell>
  );
};

const ATTENTION_ICON: Record<TodayAttentionItem['type'], React.ComponentType<{ className?: string }>> = {
  splits: Flag,
  entries: ClipboardList,
  'unpublished-plan': CalendarDays,
  'overdue-equipment': Package,
};

function attentionLink(item: TodayAttentionItem, teamPath: (p: string) => string): string {
  switch (item.type) {
    case 'splits':
      return teamPath('/analytics');
    case 'entries':
      return teamPath('/meets');
    case 'unpublished-plan':
      return teamPath('/practice-plans');
    case 'overdue-equipment':
      return teamPath('/equipment');
    default:
      return teamPath('/analytics');
  }
}

const CoachAttentionBlock: React.FC<{ seasonId: string; teamPath: (p: string) => string }> = ({ seasonId, teamPath }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['today-attention', seasonId],
    queryFn: () => todayService.getAttention(seasonId),
  });
  const items = data?.items ?? [];

  // Nothing manufactured when there's nothing to flag — an empty area is
  // the reward, not a green "all clear" badge (A3).
  if (!isLoading && !isError && items.length === 0) return null;

  return (
    <BlockShell title="Needs attention" icon={AlertTriangle} isLoading={isLoading} isError={isError} linkTo={teamPath('/analytics')} linkLabel="Analytics">
      <ul className="space-y-2">
        {items.map((item, i) => {
          const Icon = ATTENTION_ICON[item.type];
          return (
            <li key={i}>
              <Link to={attentionLink(item, teamPath)} className="flex items-center gap-2 text-sm hover:text-primary">
                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </BlockShell>
  );
};

const CoachRecentResultBlock: React.FC<{ seasonId: string; teamPath: (p: string) => string }> = ({ seasonId, teamPath }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['today-recent-result', seasonId],
    queryFn: () => todayService.getRecentResult(seasonId),
  });
  const race = data?.race;

  return (
    <BlockShell title="Recent result" icon={Trophy} isLoading={isLoading} isError={isError} linkTo={teamPath('/analytics')} linkLabel="Analytics">
      {!race ? (
        <p className="text-sm text-muted-foreground">No races yet this season.</p>
      ) : (
        <div className="space-y-1">
          <p className="font-medium truncate">{race.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(race.date)} · {race.finisherCount} finishers
            {race.avgTimeSec != null ? ` · avg ${formatTime(race.avgTimeSec)}` : ''}
          </p>
          <Link to={teamPath('/analytics')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            View results <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </BlockShell>
  );
};

// ---------------------------------------------------------------------------
// Coach view container: resolves season state, orders blocks (next meet is
// promoted above practice inside 48 hours), renders the off-season / no-
// season states explicitly rather than an empty dashboard.
// ---------------------------------------------------------------------------

const CoachToday: React.FC<{ teamPath: (p: string) => string }> = ({ teamPath }) => {
  const { data: seasonState, isLoading } = useQuery({
    queryKey: ['today-season'],
    queryFn: () => todayService.getSeasonState(),
  });

  if (isLoading || !seasonState) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-1/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (seasonState.state === 'none') {
    return <SetupChecklist />;
  }

  if (seasonState.state === 'off-season') {
    const summary = seasonState.lastSeasonSummary;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Off season</CardTitle>
          <CardDescription>
            {summary
              ? `${summary.year} season: ${summary.rosterCount} athletes, ${summary.raceCount} races.`
              : "No completed season on record yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={teamPath('/band-trends')}>View Program</Link>
          </Button>
          <Button asChild>
            <Link to={teamPath('/roster')}>Start a new season</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const seasonId = seasonState.season!.id;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CoachNextMeetBlock seasonId={seasonId} teamPath={teamPath} />
        <CoachPracticeBlock seasonId={seasonId} teamPath={teamPath} />
        <CoachAttentionBlock seasonId={seasonId} teamPath={teamPath} />
        <CoachRecentResultBlock seasonId={seasonId} teamPath={teamPath} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Athlete view: three blocks, nothing else — no team aggregates, no other
// groups, no analytics (A4). Reuses the same hooks MyProgressPage already
// uses for these exact calls.
// ---------------------------------------------------------------------------

function entryStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'ENTERED':
      return 'You are entered.';
    case 'ALTERNATE':
      return 'You are an alternate.';
    case 'SCRATCHED':
      return "You've been scratched.";
    case 'INJURED':
      return 'Marked injured for this meet.';
    case 'ACADEMIC':
      return 'Marked out for academic reasons.';
    case 'EXCUSED':
      return 'Excused from this meet.';
    default:
      return 'You are not entered.';
  }
}

const AthleteToday: React.FC<{ teamPath: (p: string) => string; linkedAthleteId: string }> = ({ teamPath, linkedAthleteId }) => {
  const { data: planData, isLoading: planLoading, isError: planError } = useMyPracticePlan(todayIso(), true);
  const { data: meetCard, isLoading: meetLoading, isError: meetError } = useMyMeetCard(true);
  const { data: recentRaces, isLoading: raceLoading, isError: raceError } = useQuery({
    queryKey: ['myRecentRace', linkedAthleteId],
    queryFn: () => athleteService.getRecentRaces(linkedAthleteId, 1),
  });

  const plan = planData?.plan;
  const lastRace = recentRaces?.[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <BlockShell title="Today's practice" icon={CalendarDays} isLoading={planLoading} isError={planError} linkTo={teamPath('/me')} linkLabel="My Progress">
        {!plan ? (
          <p className="text-sm text-muted-foreground">No practice planned for today.</p>
        ) : (
          <div className="space-y-1">
            {plan.title && <p className="font-medium">{plan.title}</p>}
            {plan.assignments.map((a, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {a.focus ?? 'Workout'}
                {a.distanceMi ? ` · ${a.distanceMi} mi` : ''}
                {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}
              </p>
            ))}
            {plan.startTime && <p className="text-sm text-muted-foreground">Starts {plan.startTime}</p>}
          </div>
        )}
      </BlockShell>

      <BlockShell title="Next meet" icon={Flag} isLoading={meetLoading} isError={meetError} linkTo={teamPath('/me')} linkLabel="My Progress">
        {!meetCard?.meet ? (
          <p className="text-sm text-muted-foreground">No upcoming meet scheduled.</p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium truncate">{meetCard.meet.name}</p>
            <p className="text-sm text-muted-foreground">{entryStatusLabel(meetCard.entry?.status)}</p>
            {meetCard.plan?.departureTime && (
              <p className="text-sm text-muted-foreground">Departs {meetCard.plan.departureTime}</p>
            )}
            {meetCard.plan?.bringList && (
              <p className="text-sm text-muted-foreground">Bring: {meetCard.plan.bringList}</p>
            )}
          </div>
        )}
      </BlockShell>

      <BlockShell title="My last race" icon={Gauge} isLoading={raceLoading} isError={raceError} linkTo={teamPath('/me')} linkLabel="My Progress">
        {!lastRace ? (
          <p className="text-sm text-muted-foreground">No races logged yet.</p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium truncate">{lastRace.raceName}</p>
            <p className="text-sm text-muted-foreground">{formatDateShort(lastRace.date)} · {formatTime(lastRace.time)}</p>
            <Link to={teamPath('/me')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              My Progress <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </BlockShell>
    </div>
  );
};

// ---------------------------------------------------------------------------

const TodayPage: React.FC = () => {
  const { currentUser } = useAuth();
  const teamPath = useTeamPath();
  const { data: teamContext } = useTeamContext();

  const seasonLabel = teamContext?.activeSeason ? `Season ${teamContext.activeSeason}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Today</h1>
        {seasonLabel && <span className="text-sm text-muted-foreground">{seasonLabel}</span>}
      </div>

      {currentUser?.linkedAthlete ? (
        <AthleteToday teamPath={teamPath} linkedAthleteId={currentUser.linkedAthlete.id} />
      ) : (
        <CoachToday teamPath={teamPath} />
      )}
    </div>
  );
};

export default TodayPage;
