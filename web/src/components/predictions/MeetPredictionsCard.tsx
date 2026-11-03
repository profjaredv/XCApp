import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { formatTime, formatPace } from '@/lib/formatUtils';
import { useMeetRacePredictions } from '@/hooks/useRacePredictions';

// The whole roster's predicted time for this meet at a glance — the
// team-wide counterpart to RacePredictionCard's single-athlete view.
// Computes (and freezes) any prediction that doesn't exist yet for an
// entered athlete, same as the athlete-page card. Sorted fastest to
// slowest within whichever gender is selected — the two are never
// combined into one ranking, same rule every other scoring/placement
// view in this app already follows.
export function MeetPredictionsCard({ meetId }: { meetId: string | undefined }) {
  const { data: predictions, isLoading } = useMeetRacePredictions(meetId);
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all');

  const sorted = useMemo(() => {
    const withPrediction = (predictions ?? []).filter((p) => p.prediction);
    const filtered = genderFilter === 'all' ? withPrediction : withPrediction.filter((p) => p.gender === genderFilter);
    return [...filtered].sort((a, b) => a.prediction!.predictedTimeSec - b.prediction!.predictedTimeSec);
  }, [predictions, genderFilter]);

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

  const withPredictionCount = predictions.filter((p) => p.prediction).length;
  if (withPredictionCount === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-medium">Predicted times</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {withPredictionCount} of {predictions.length} athletes have enough history to predict · fastest first
          </p>
        </div>
        <Select value={genderFilter} onValueChange={(value: 'all' | 'M' | 'F') => setGenderFilter(value)}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="M">Boys</SelectItem>
            <SelectItem value="F">Girls</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No predictions for that gender yet.</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((entry, i) => (
              <div key={`${entry.athleteId}-${entry.raceId}`} className="flex items-center justify-between py-1 text-sm">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="truncate">{entry.athleteName}</span>
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span className="font-medium">{formatTime(entry.prediction!.predictedTimeSec)}</span>
                  <span className="text-xs text-muted-foreground">{formatPace(entry.prediction!.predictedPaceSecPerMile)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MeetPredictionsCard;
