import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, TrendingUp } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { athleteJourneyService, type Band } from '@/api/athleteJourneyService';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import { deriveGrade, gradeLabel } from '@/lib/seasonUtils';

// Workstream E1 (LeadPack Master Build Handoff): "one scrolling page with
// the band path as the spine... freshman year at rank 87, senior year at
// rank 9, courses and PRs hanging off it. Design for screenshot at phone
// width." Single column throughout, deliberately — this is meant to be
// screenshotted and sent, not browsed on a wide monitor.

const BAND_LABEL: Record<NonNullable<Band>, string> = { top: 'Top band', middle: 'Middle band', bottom: 'Bottom band' };
const BAND_VARIANT: Record<NonNullable<Band>, 'default' | 'secondary' | 'outline'> = {
  top: 'default',
  middle: 'secondary',
  bottom: 'outline',
};

const AthleteJourneyPage: React.FC = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const teamPath = useTeamPath();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['athleteJourney', athleteId],
    queryFn: () => athleteJourneyService.getJourney(athleteId as string),
    enabled: !!athleteId,
  });

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto">
        <p className="text-muted-foreground">Couldn't load this journey.</p>
      </div>
    );
  }

  const { athlete, seasons, courseBests, prs } = data;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">{athlete.name}</h1>
        <p className="text-sm text-muted-foreground">
          {seasons.length} season{seasons.length === 1 ? '' : 's'} on record
        </p>
      </div>

      {seasons.length === 0 ? (
        <p className="text-muted-foreground">No finished races on record yet.</p>
      ) : (
        <div className="relative space-y-4 border-l-2 border-border pl-5">
          {seasons.map((s) => {
            const grade = deriveGrade(athlete.graduationYear, s.year);
            return (
              <div key={s.year} className="relative">
                <div className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {s.year} {grade != null && <span className="text-muted-foreground font-normal">· {gradeLabel(grade)}</span>}
                      </span>
                      {s.isCaptain && <Badge variant="outline">Captain</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.rank != null && (
                        <span className="text-sm font-medium">
                          {s.rank}
                          {ordinalSuffix(s.rank)} of {s.rosterSize}
                        </span>
                      )}
                      {s.band && <Badge variant={BAND_VARIANT[s.band]}>{BAND_LABEL[s.band]}</Badge>}
                    </div>
                    {s.seasonBest && (
                      <div className="text-sm text-muted-foreground">
                        Season best: {formatTime(s.seasonBest.timeSec)} ({formatPace(s.seasonBest.paceSecPerMile)}) —{' '}
                        <Link to={teamPath(`/analytics?tab=meets`)} className="text-primary hover:underline">
                          {s.seasonBest.raceName}
                        </Link>{' '}
                        {formatDateShort(s.seasonBest.date)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {courseBests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Courses raced more than once
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {courseBests.map((c) => (
              <div key={c.courseId} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{c.courseName ?? 'Unknown course'}</p>
                  <p className="text-muted-foreground">
                    Best {formatTime(c.bestTimeSec)} ({c.raceCount} races)
                  </p>
                </div>
                {c.deltaSec > 0 && (
                  <Badge variant="secondary">-{formatTime(c.deltaSec)}</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {prs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              Personal records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {prs.map((pr) => (
              <div key={pr.distanceMeters} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{Math.round(pr.distanceMeters)}m</p>
                  <p className="text-muted-foreground">
                    {pr.raceName} · {formatDateShort(pr.date)}
                  </p>
                </div>
                <span className="font-medium">{formatTime(pr.time)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export default AthleteJourneyPage;
