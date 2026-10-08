import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { formatTime, formatPace } from '@/lib/formatUtils';
import { useMeetRacePredictions } from '@/hooks/useRacePredictions';

// The whole roster's predicted time for this meet at a glance — the
// team-wide counterpart to RacePredictionCard's single-athlete view.
// Computes (and freezes) any prediction that doesn't exist yet for an
// entered athlete, same as the athlete-page card.
export function MeetPredictionsCard({ meetId }: { meetId: string | undefined }) {
  const { data: predictions, isLoading } = useMeetRacePredictions(meetId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Predicted times</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!predictions || predictions.length === 0) {
    return null;
  }

  const withPrediction = predictions.filter((p) => p.prediction);
  if (withPrediction.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Predicted times</CardTitle>
        <p className="text-xs text-muted-foreground">
          {withPrediction.length} of {predictions.length} entered athletes have enough history to predict.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {withPrediction.map((entry) => (
            <div key={`${entry.athleteId}-${entry.raceId}`} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate">{entry.athleteName}</span>
              <span className="flex items-baseline gap-2 shrink-0">
                <span className="font-medium">{formatTime(entry.prediction!.predictedTimeSec)}</span>
                <span className="text-xs text-muted-foreground">{formatPace(entry.prediction!.predictedPaceSecPerMile)}</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default MeetPredictionsCard;
