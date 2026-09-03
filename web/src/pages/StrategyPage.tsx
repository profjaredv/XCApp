import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStrategy } from '@/hooks/useStrategy';
import type { LeverConfidence, StrategyLever } from '@/api/strategyService';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { formatTime, formatDateShort } from '@/lib/formatUtils';
import { RACE_TACTICS } from '@/content/raceTactics';

// "How do I take 20 seconds off my next race?"
//
// The conversation a coach and an athlete have in the car park, answered
// from the races that athlete has already run. Everything above the tactics
// section is arithmetic on their own results — see backend/lib/
// raceStrategy.js — and the labels matter as much as the numbers:
//
//   You've done this          a gap between their best race and their
//                              typical one. Not a projection; a time they
//                              have run, with a date.
//   If you paced it perfectly what perfect pacing would be worth. Reported
//                              because it sizes the problem, labelled
//                              because nobody holds mile-one pace to the
//                              finish.
//   Good to know               context with no number attached, which is
//                              honest rather than padding the total.
//
// Only the first kind counts toward the goal. Adding a ceiling to it would
// turn an honest answer into a promise.
//
// Race Tactics, below, is a different kind of honest: it is not this
// athlete's data at all, it is common proven coaching cues (content/
// raceTactics.ts) that apply whether or not they have three races on file
// yet. It must never be presented as if it came from their results — see
// the disclaimer line wherever it renders.

const TARGET_OPTIONS = [10, 20, 30, 60];

// Written for the person reading it: a sixteen-year-old on their phone the
// week of a race. "Already in you" and "Ceiling" were accurate and meant
// nothing to them.
const CONFIDENCE_LABEL: Record<LeverConfidence, string> = {
  measured: "You've done this",
  ceiling: 'If you paced it perfectly',
  context: 'Good to know',
  gap: 'Missing',
};

const CONFIDENCE_TONE: Record<LeverConfidence, string> = {
  measured: 'bg-primary/10 text-primary',
  ceiling: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-50',
  context: 'bg-muted text-muted-foreground',
  gap: 'bg-muted text-muted-foreground',
};

function distanceLabel(meters: number): string {
  if (Math.abs(meters - 5000) < 60) return '5K';
  if (Math.abs(meters - 3200) < 60) return '3200m';
  if (Math.abs(meters - 1600) < 60) return '1600m';
  if (Math.abs(meters - 8000) < 60) return '8K';
  return `${Math.round(meters)}m`;
}

const Lever: React.FC<{ lever: StrategyLever }> = ({ lever }) => (
  <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
    <div className="w-24 shrink-0">
      {lever.seconds != null && lever.seconds > 0 ? (
        <span className="text-2xl font-bold tabular-nums">−{lever.seconds}s</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
      <span className={cn('mt-1 block w-fit rounded px-1.5 py-0.5 text-[11px] font-medium', CONFIDENCE_TONE[lever.confidence])}>
        {CONFIDENCE_LABEL[lever.confidence]}
      </span>
    </div>
    <div className="min-w-0">
      <p className="font-medium">{lever.title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{lever.detail}</p>
    </div>
  </div>
);

const StrategyPage: React.FC = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const [targetSec, setTargetSec] = useState(20);
  const [distanceMeters, setDistanceMeters] = useState<number | undefined>(undefined);

  const { data, isLoading } = useStrategy(athleteId ?? null, { targetSec, distanceMeters });

  if (isLoading) {
    return (
      <div className="container space-y-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container py-8">
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center">
            <CardTitle>Nothing to work with yet</CardTitle>
            <CardDescription>This athlete has no finished races on file.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { strategy } = data;

  return (
    <div className="container space-y-6 py-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-3 mb-1" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="flex items-center gap-2 text-3xl font-bold md:text-4xl">
          <Target className="h-7 w-7" />
          Strategy session
        </h1>
        <p className="text-muted-foreground">
          {data.athlete.name} — where the next {targetSec} seconds come from.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Take off</span>
        {TARGET_OPTIONS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === targetSec ? 'secondary' : 'outline'}
            onClick={() => setTargetSec(option)}
          >
            {option}s
          </Button>
        ))}
        {data.distances.length > 1 && (
          <Select
            value={String(distanceMeters ?? strategy.distanceMeters)}
            onValueChange={(v) => setDistanceMeters(Number(v))}
          >
            <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.distances.map((d) => (
                <SelectItem key={d.distanceMeters} value={String(d.distanceMeters)}>
                  {distanceLabel(d.distanceMeters)} ({d.raceCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {strategy.bestTimeSec != null && strategy.targetTimeLabel
              ? `Your goal: ${strategy.targetTimeLabel}`
              : 'Your goal'}
          </CardTitle>
          <CardDescription>
            {strategy.raceCount === 0
              ? 'You have no finished races at this distance yet.'
              : `That is ${targetSec} seconds off your best (${formatTime(strategy.bestTimeSec ?? 0)}${
                  strategy.bestRaceName ? `, at ${strategy.bestRaceName}` : ''
                }).`}
          </CardDescription>
        </CardHeader>
        {strategy.raceCount > 0 && (
          <CardContent className="space-y-4 pt-0">
            {/* The splits, first and biggest. This is the part that goes to
                the start line; everything below it is the reasoning. */}
            {strategy.plan && (
              <div>
                <p className="mb-2 text-sm font-medium">Run these splits</p>
                <div className="flex flex-wrap gap-2">
                  {strategy.plan.splits.map((split) => (
                    <div
                      key={split.label}
                      className={cn(
                        'rounded-lg border px-3 py-2',
                        split.label === 'Finish' && 'border-primary bg-primary/5'
                      )}
                    >
                      <p className="text-xs text-muted-foreground">{split.label}</p>
                      <p className="text-xl font-bold tabular-nums">{formatTime(split.cumulativeSec)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Even pace the whole way. Times are what the clock should say as you go past.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium">On race day</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{strategy.instruction}</p>
            </div>

            <p className="text-sm">
              {strategy.withinReach
                ? `You have already been ${strategy.measuredTotalSec} seconds quicker than your normal race this season, so the speed is there. This is about how you run the race, not how fit you are.`
                : `Your races so far cover ${strategy.measuredTotalSec} of the ${targetSec} seconds. The rest comes from pacing it better and from training between now and then.`}
            </p>
          </CardContent>
        )}
      </Card>

      {strategy.levers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Where the time is</CardTitle>
            <CardDescription>
              Only the "you've done this" ones count toward the goal. The pacing number is how big the problem is, not
              seconds you can bank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {strategy.levers.map((lever) => (
                <Lever key={lever.id} lever={lever} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {strategy.gaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">What would make this better</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {strategy.gaps.map((lever) => (
                <Lever key={lever.id} lever={lever} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not this athlete's data — common coaching cues, in race order.
          Kept visually distinct from the findings above (no seconds badge,
          no confidence label) so it never reads as something derived from
          their own results. See content/raceTactics.ts. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Race tactics</CardTitle>
          <CardDescription>
            General racing tactics — not from {data.athlete.name}'s data. Things to think about at each part of the
            race, in order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {RACE_TACTICS.map((tactic) => (
              <div key={tactic.id} className="py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tactic.phase}</p>
                <p className="mt-0.5 font-medium">{tactic.cue}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{tactic.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.races && data.races.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Races this is based on</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {data.races.map((race) => (
                <div key={race.raceId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {race.raceName}
                    <span className="ml-2 text-xs text-muted-foreground">{formatDateShort(race.date)}</span>
                  </span>
                  <span className="tabular-nums">{formatTime(race.timeSec)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Every number here comes from races {data.athlete.name} has already run. Nothing is predicted. Courses and
        weather are never the same twice, so a few seconds either way is normal.{' '}
        <button type="button" className="underline" onClick={() => navigate(teamPath(`/team/athlete/${athleteId}`))}>
          See the full profile
        </button>
      </p>
    </div>
  );
};

export default StrategyPage;
