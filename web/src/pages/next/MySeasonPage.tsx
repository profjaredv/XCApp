import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDateShort, formatTime } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
import { formatSplitMMSS, SPLIT_PATTERN_LABEL } from '@/lib/splitPatternDisplay';
import { prsByEvent, eventLabel, type RaceForPr } from '@/lib/prsByEvent';
import { NextPageHeader } from '@/components/next/PageHeader';
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
      <NextPageHeader
        title={name}
        subtitle={[grade != null && !Number.isNaN(grade) ? gradeLabel(grade) : null, ...groupNames].filter(Boolean).join(' · ') || 'My Season'}
        primary={
          <Button asChild variant="outline" className="min-h-12 lg:min-h-10">
            <Link to={teamPath(`/athlete/${athleteId}/journey`)}>
              <MapIcon className="mr-1.5 h-4 w-4" />
              Journey
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          {prs.length > 0 && (
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:px-0" aria-label="Personal records">
              {prs.map((pr) => (
                <div key={pr.label} className="min-w-[7.5rem] shrink-0 rounded-xl border bg-card px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{pr.label} PR</p>
                  <p className="text-lg font-semibold tabular-nums">{formatTime(pr.race.time)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{pr.race.season}</p>
                </div>
              ))}
            </div>
          )}

          <CourseAdjustedProgressionCard athleteId={athleteId} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{activeYear} races</h2>
            {seasonRaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No races yet this season. They show up here once results are in.</p>
            ) : (
              seasonRaces.map((race, i) => {
                const mine = reflections[i]?.data?.reflection;
                const s = splitsByRace.get(race.raceId);
                const goalTime = mine?.targetTimeSec ?? null;
                const delta = goalTime != null ? race.time - goalTime : null;
                return (
                  <Card key={race.raceId || race.date}>
                    <CardHeader className="pb-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <CardTitle className="min-w-0 truncate text-base">{race.meetName}</CardTitle>
                        <span className="shrink-0 text-lg font-semibold tabular-nums">{formatTime(race.time)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(race.date)}
                        {race.distanceMeters ? ` · ${eventLabel(race.distanceMeters)}` : ''}
                        {race.place != null ? ` · ${race.place}${race.fieldSize ? ` of ${race.fieldSize}` : ''}` : ''}
                        {race.teamPlace != null ? ` · ${ordinal(race.teamPlace)} on the team` : ''}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {reflectionsOn && (
                        <p>
                          <span className="text-muted-foreground">Goal: </span>
                          {mine && (mine.outcomeGoal || goalTime != null) ? (
                            <>
                              {[mine.outcomeGoal, goalTime != null ? formatTime(goalTime) : null].filter(Boolean).join(' · ')}
                              {delta != null && (
                                <Badge variant="outline" className={`ml-2 font-normal ${delta <= 0 ? 'text-green-700 dark:text-green-400' : ''}`}>
                                  {delta <= 0 ? `beat it by ${formatTime(-delta)}` : `${formatTime(delta)} over`}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">none set</span>
                          )}
                        </p>
                      )}
                      {s && (
                        <p className="text-xs text-muted-foreground">
                          {s.analysis ? `${SPLIT_PATTERN_LABEL[s.analysis.pattern]} · ` : ''}
                          {s.segments.map((seg) => `${seg.isClosing ? 'Final' : `Seg ${seg.sequence}`} ${formatSplitMMSS(seg.segmentSec)}`).join(' · ')}
                        </p>
                      )}
                      {reflectionsOn &&
                        (mine?.postSubmittedAt ? (
                          <p>
                            <span className="text-muted-foreground">Reflection: </span>
                            {[mine.whatWorked, mine.whatDidnt, mine.postNotes].filter(Boolean).join(' · ') || 'saved'}
                            <Button variant="link" className="h-auto p-0 pl-2" onClick={() => setReflect({ raceId: race.raceId, name: race.meetName })}>
                              Edit
                            </Button>
                          </p>
                        ) : (
                          <Button className="min-h-12 w-full sm:min-h-9 sm:w-auto" variant="outline" onClick={() => setReflect({ raceId: race.raceId, name: race.meetName })}>
                            Reflect on this race
                          </Button>
                        ))}
                    </CardContent>
                  </Card>
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
