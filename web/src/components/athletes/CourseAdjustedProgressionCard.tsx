import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mountain } from 'lucide-react';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import enhancedAnalyticsService from '@/api/enhancedAnalyticsService';
import {
  buildProgression,
  formatDelta,
  formatCourseEffect,
} from '@/lib/courseAdjustedProgression';

// "He ran 6:00 on the track and 6:20 on the hill — did he regress?"
// Raw times can't answer that; this card can. Every race in a season is
// restated on one common course, so the number left over is the runner.
// The math (leave-one-out, (n-1)/n shrinkage) lives in
// backend/lib/courseDifficulty.js.

interface CourseAdjustedProgressionCardProps {
  athleteId: string;
  /** Which season to show. Falls back to the athlete's most recent one. */
  season?: number;
}

export const CourseAdjustedProgressionCard = ({ athleteId, season }: CourseAdjustedProgressionCardProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['adjustedProgression', athleteId],
    queryFn: () => enhancedAnalyticsService.getAdjustedProgression(athleteId),
    enabled: Boolean(athleteId),
  });

  const seasons = useMemo(() => data?.seasons ?? [], [data]);
  const [seasonOverride, setSeasonOverride] = useState<number | null>(null);

  // The season the coach asked for, if this athlete raced it; otherwise
  // their most recent one, rather than an empty card.
  const shown = useMemo(() => {
    if (!seasons.length) return null;
    const wanted = seasonOverride ?? season;
    return seasons.find((s) => s.season === wanted) ?? seasons[seasons.length - 1];
  }, [seasons, season, seasonOverride]);

  const steps = useMemo(() => (shown ? buildProgression(shown.races) : []), [shown]);

  if (isLoading || !shown || steps.length === 0) return null;

  // A single race has no progression to show — one adjusted number with
  // nothing to compare it to isn't worth a card.
  if (steps.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mountain className="h-5 w-5" />
          Course-adjusted progression
        </CardTitle>
        <CardDescription>
          Every {shown.season} race put on the same course, so a slower time on a harder course reads
          as the improvement it was. Adjusted paces compare to each other within a season — they
          aren't track times.
        </CardDescription>
        {seasons.length > 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {seasons.map((s) => (
              <Badge
                key={s.season}
                variant={s.season === shown.season ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSeasonOverride(s.season)}
              >
                {s.season}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map(({ race, rawDeltaSecPerMile, adjustedDeltaSecPerMile, courseMasked }) => (
            <div key={race.raceId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{race.raceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateShort(race.date)} •{' '}
                    {formatCourseEffect(race.courseDifficultySecPerMile, race.contributingCount)}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-6 text-right">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Raw</p>
                    <p className="font-medium">{formatTime(race.timeSec)}</p>
                    <p className="text-xs text-muted-foreground">{formatDelta(rawDeltaSecPerMile)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Adjusted</p>
                    <p className="font-medium">
                      {race.adjustedTimeSec != null ? formatTime(race.adjustedTimeSec) : '—'}
                    </p>
                    <p
                      className={
                        adjustedDeltaSecPerMile != null && adjustedDeltaSecPerMile < 0
                          ? 'text-xs font-medium text-emerald-600'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {formatDelta(adjustedDeltaSecPerMile)}
                    </p>
                  </div>
                </div>
              </div>

              {/* The reason this card exists — say it in words, not just
                  two columns a coach has to diff in their head. */}
              {courseMasked && (
                <p className="mt-2 rounded bg-muted px-2 py-1 text-sm">
                  {adjustedDeltaSecPerMile != null && adjustedDeltaSecPerMile < 0
                    ? `Looks ${formatDelta(rawDeltaSecPerMile)} slower, but the course was harder — this was an improvement.`
                    : `Looks ${formatDelta(rawDeltaSecPerMile)} faster, but the course was easier — this was a step back.`}
                </p>
              )}

              {race.adjustedPaceSecPerMile != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {race.paceSecPerMile != null && `${formatPace(race.paceSecPerMile)} /mi raw • `}
                  {formatPace(race.adjustedPaceSecPerMile)} /mi adjusted, from{' '}
                  {race.contributingCount} teammate{race.contributingCount === 1 ? '' : 's'}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CourseAdjustedProgressionCard;
