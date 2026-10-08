import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { isFullCoach } from '@/lib/teamRole';
import { useNextRacePrediction, useRecomputeRacePrediction } from '@/hooks/useRacePredictions';

// Shows an athlete's frozen prediction for their next entered race — see
// backend/lib/racePrediction.js for the model this renders (a course-
// adjusted fitness trend, the target course's own difficulty when known,
// this athlete's recent split shape, and their own learned bias once they
// have a track record). Used on both the coach's view of an athlete
// (TeamAthleteProfilePage) and the athlete's own page (MyProgressPage) —
// only the Recompute button's visibility differs, by role.
export function RacePredictionCard({ athleteId }: { athleteId: string | undefined }) {
  const { currentUser } = useAuth();
  const { data, isLoading } = useNextRacePrediction(athleteId);
  const recompute = useRecomputeRacePrediction(athleteId);
  const canRecompute = isFullCoach(currentUser);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Predicted next race</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.prediction) {
    const reason = data?.reason;
    const message =
      reason === 'insufficient-history'
        ? `Not enough race history yet to predict ${data?.race ? `the ${data.race.name}` : 'their next race'} — needs at least one race this season.`
        : "Not entered in an upcoming race yet.";
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Predicted next race</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    );
  }

  const p = data.prediction;
  const hasScore = p.scoredAt != null && p.actualTimeSec != null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-medium">Predicted next race</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {p.raceName} · {formatDateShort(p.raceDate)}
          </p>
        </div>
        {canRecompute && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={recompute.isPending}
            onClick={() => recompute.mutate({ raceId: p.raceId })}
          >
            {recompute.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{formatTime(p.predictedTimeSec)}</span>
          <span className="text-sm text-muted-foreground">{formatPace(p.predictedPaceSecPerMile)}</span>
        </div>

        {p.marginSecPerMile != null && (
          <p className="text-xs text-muted-foreground">
            Typically within ± {formatPace(p.marginSecPerMile).replace('/mi', '')} /mi of this athlete's past predictions
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Based on {p.basedOnRaceCount} race{p.basedOnRaceCount === 1 ? '' : 's'} this season
          {p.courseDifficultySecPerMile == null
            ? ' · course difficulty unknown, using season-average pace'
            : ` · course adjustment ${p.courseDifficultySecPerMile >= 0 ? '+' : ''}${Math.round(p.courseDifficultySecPerMile)} sec/mi`}
        </p>

        {p.predictedSplits && p.predictedSplits.length > 1 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Predicted splits</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {p.predictedSplits.map((s) => (
                <span key={s.sequence} className="text-xs">
                  <span className="text-muted-foreground">{s.label}:</span> {formatTime(s.predictedElapsedSec)}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasScore && (
          <div className="pt-2 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Actual: <span className="font-medium text-foreground">{formatTime(p.actualTimeSec as number)}</span>
            </span>
            <Badge variant={((p.errorSecPerMile ?? 0) <= 0) ? 'default' : 'secondary'} className="gap-1">
              {(p.errorSecPerMile ?? 0) <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {Math.abs(Math.round(p.errorSecPerMile ?? 0))} sec/mi {(p.errorSecPerMile ?? 0) <= 0 ? 'faster' : 'slower'} than predicted
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RacePredictionCard;
