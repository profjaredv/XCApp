import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { useMyGroups } from '@/hooks/useGroups';
import { useAthleteSplits } from '@/hooks/useSplits';
import { performanceService } from '@/api/performanceService';
import { raceReflectionService } from '@/api/raceReflectionService';
import { formatTime } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
import { formatSplitMMSS, SPLIT_PATTERN_LABEL } from '@/lib/splitPatternDisplay';
import { prsByEvent, eventLabel, type RaceForPr } from '@/lib/prsByEvent';
import { Avatar, DateTile, Hero, SectionHeading } from '@/components/next/Visual';
import { CourseAdjustedProgressionCard } from '@/components/athletes/CourseAdjustedProgressionCard';
import { RaceReflectionDialogBody } from '@/components/reflections/RaceReflectionDialogBody';
import MyProgressPage from '../MyProgressPage';

// My Season (docs/leadpack-new-ui-trial.md §4.7): an athlete's season as
// races — each with its result, place, goal vs. result and reflection —
// under a PR strip and the season chart. Today's practice and the next
// meet live on Today, not here.

interface SeasonRace extends RaceForPr {
  season: number;
  place: number | null;
  fieldSize: number | null;
  teamPlace: number | null;
}

const MySeasonPage: React.FC = () => {
  const { currentUser } = useAuth();
  const athlete = currentUser?.linkedAthlete;
  // A coach landing on /me (e.g. from a bookmark) gets classic's own
  // "not linked" explanation rather than an empty page.
  if (!athlete) return <MyProgressPage />;
  return <MySeason athleteId={athlete.id} name={athlete.preferredName || athlete.name} graduationYear={athlete.graduationYear ?? null} />;
};

const MySeason: React.FC<{ athleteId: string; name: string; graduationYear: number | null }> = ({ athleteId, name }) => {
  const teamPath = useTeamPath();
  const { activeYear } = useSeasonSelection();
  const reflectionsOn = useFeatureEnabled('reflections');
  const { data: myGroups } = useMyGroups();
  const { data: allSeasons, isLoading } = useQuery({
    queryKey: ['athleteAllSeasons', athleteId],
    queryFn: () => performanceService.getAthleteAllSeasons(athleteId),
    retry: false,
  });
  const { data: splits = [] } = useAthleteSplits(athleteId);
  const [reflect, setReflect] = useState<{ raceId: string; name: string } | null>(null);

  const seasons = useMemo(() => allSeasons?.data?.seasons ?? [], [allSeasons]);
  const allRaces: SeasonRace[] = useMemo(
    () =>
      seasons.flatMap((s) =>
        ((s.races ?? []) as Array<Record<string, unknown>>).map((r) => ({
          raceId: String(r.raceId ?? r.id ?? ''),
          meetName: String(r.meetName ?? ''),
          date: String(r.date ?? ''),
          time: Number(r.time),
          distanceMeters: (r.distanceMeters as number | null) ?? null,
          season: Number(r.season ?? s.season),
          place: (r.place as number | null) ?? null,
          fieldSize: (r.fieldSize as number | null) ?? null,
          teamPlace: (r.teamPlace as number | null) ?? null,
        }))
      ),
    [seasons]
  );
  const prs = useMemo(() => prsByEvent(allRaces), [allRaces]);
  const seasonRaces = allRaces.filter((r) => r.season === activeYear).sort((a, b) => b.date.localeCompare(a.date));
  const thisSeason = seasons.find((s) => s.season === activeYear);
  const reflections = useQueries({
    queries: seasonRaces.map((r) => ({
      queryKey: ['myReflection', r.raceId],
      queryFn: () => raceReflectionService.getMine(r.raceId),
      enabled: reflectionsOn,
    })),
  });
  const splitsByRace = new Map(splits.filter((s) => s.segments.length > 0).map((s) => [s.raceId, s]));
  const groupNames = (myGroups ?? []).filter((g) => g.type !== 'X_TRAINING').map((g) => g.name);
  const grade = thisSeason?.grade != null ? Number(thisSeason.grade) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-3 pt-1">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight">{name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {[grade != null && !Number.isNaN(grade) ? gradeLabel(grade) : null, ...groupNames].filter(Boolean).join(' · ') || 'My Season'}
          </p>
        </div>
        <Link
          to={teamPath(`/athlete/${athleteId}/journey`)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold hover:bg-accent"
        >
          <MapIcon className="h-4 w-4" />
          Journey
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          {prs.length > 0 && (
            <Hero>
              <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Personal records</p>
              <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]" aria-label="Personal records">
                {prs.map((pr) => (
                  <div key={pr.label} className="min-w-[7.25rem] shrink-0 rounded-2xl bg-white/10 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-primary-foreground/70">{pr.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{formatTime(pr.race.time)}</p>
                    <p className="truncate text-[11px] text-primary-foreground/70">{pr.race.season === activeYear ? 'This season' : pr.race.season}</p>
                  </div>
                ))}
              </div>
            </Hero>
          )}

          <CourseAdjustedProgressionCard athleteId={athleteId} />

          <section className="space-y-3">
            <SectionHeading title={`${activeYear} races`} />
            {seasonRaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No races yet this season. They show up here once results are in.</p>
            ) : (
              seasonRaces.map((race, i) => {
                const mine = reflections[i]?.data?.reflection;
                const s = splitsByRace.get(race.raceId);
                const goalTime = mine?.targetTimeSec ?? null;
                const delta = goalTime != null ? race.time - goalTime : null;
                return (
                  <section key={race.raceId || race.date} className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border/60">
                    <div className="flex items-start gap-3">
                      <DateTile date={race.date} className="bg-muted text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{race.meetName}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {race.distanceMeters ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{eventLabel(race.distanceMeters)}</span> : null}
                          {race.place != null && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                              {ordinal(race.place)}
                              {race.fieldSize ? ` of ${race.fieldSize}` : ''}
                            </span>
                          )}
                          {race.teamPlace != null && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{ordinal(race.teamPlace)} on the team</span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-2xl font-bold tabular-nums">{formatTime(race.time)}</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {reflectionsOn && (
                        <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2">
                          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">
                            {mine && (mine.outcomeGoal || goalTime != null) ? (
                              [mine.outcomeGoal, goalTime != null ? formatTime(goalTime) : null].filter(Boolean).join(' · ')
                            ) : (
                              <span className="text-muted-foreground">No goal set</span>
                            )}
                          </span>
                          {delta != null && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                                delta <= 0 ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              }`}
                            >
                              {delta <= 0 ? `beat it by ${formatTime(-delta)}` : `${formatTime(delta)} over`}
                            </span>
                          )}
                        </div>
                      )}
                      {s && (
                        <div>
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Splits{s.analysis ? ` · ${SPLIT_PATTERN_LABEL[s.analysis.pattern]}` : ''}
                          </p>
                          <div className="flex gap-1.5">
                            {s.segments.map((seg) => (
                              <span key={seg.sequence} className="min-w-0 flex-1 rounded-xl bg-muted/60 px-2 py-1.5 text-center">
                                <span className="block text-[10px] text-muted-foreground">{seg.isClosing ? 'Final' : `Seg ${seg.sequence}`}</span>
                                <span className="block text-sm font-semibold tabular-nums">{formatSplitMMSS(seg.segmentSec)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {reflectionsOn &&
                        (mine?.postSubmittedAt ? (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Reflection: </span>
                            {[mine.whatWorked, mine.whatDidnt, mine.postNotes].filter(Boolean).join(' · ') || 'saved'}
                            <Button variant="link" className="h-auto p-0 pl-2" onClick={() => setReflect({ raceId: race.raceId, name: race.meetName })}>
                              Edit
                            </Button>
                          </p>
                        ) : (
                          <Button className="min-h-12 w-full" variant="outline" onClick={() => setReflect({ raceId: race.raceId, name: race.meetName })}>
                            Reflect on this race
                          </Button>
                        ))}
                    </div>
                  </section>
                );
              })
            )}
          </section>
        </div>
      )}

      <Dialog open={!!reflect} onOpenChange={(o) => !o && setReflect(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reflect?.name ?? 'Race'}</DialogTitle>
            <DialogDescription>How did it go?</DialogDescription>
          </DialogHeader>
          {reflect && <RaceReflectionDialogBody raceId={reflect.raceId} initialTab="post" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export default MySeasonPage;
