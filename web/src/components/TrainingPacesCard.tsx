import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gauge } from 'lucide-react';
import { trainingPacesFromRace, intervalSplitsForZone } from '@/lib/vdotPaces';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';

export interface TrainingPaceRace {
  id: string;
  raceName: string;
  date: string;
  distance: number;
  time: number;
}

// "What pace should I be hitting?" answered from an athlete's own most
// recent race, not a manual time-entry tool — defaults to their newest
// result, recomputes live (no "calculate metrics first" dependency, same
// reasoning as this session's group-analytics work). Per-distance splits
// (the 800m T-pace question) only show for the workout zones a coach
// actually sends someone to the track for — Threshold/Interval/
// Repetition — not Easy/Marathon, which are continuous-run paces no one
// hits a stopwatch split for every 800m.
export const TrainingPacesCard: React.FC<{ recentRaces: TrainingPaceRace[] }> = ({ recentRaces }) => {
  const [selectedRaceId, setSelectedRaceId] = useState('');
  useEffect(() => {
    if (recentRaces.length > 0 && !recentRaces.some((r) => r.id === selectedRaceId)) {
      setSelectedRaceId(recentRaces[0].id);
    }
  }, [recentRaces, selectedRaceId]);

  const activeRace = recentRaces.find((r) => r.id === selectedRaceId);
  const paceResult = activeRace ? trainingPacesFromRace(activeRace.distance, activeRace.time) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gauge className="h-5 w-5" />
          Recommended training paces
        </CardTitle>
        <CardDescription>
          Based on a recent race — an estimate, not a guarantee. Adjust for how you feel and weather/terrain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentRaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">No race results yet — training paces will appear here once there's a result.</p>
        ) : (
          <>
            <div className="max-w-sm space-y-2">
              <Label>Based on</Label>
              <Select value={selectedRaceId} onValueChange={setSelectedRaceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recentRaces.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.raceName} — {formatTime(r.time)} ({formatDateShort(r.date)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paceResult ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {paceResult.paces.map((zone) => {
                  const splits = intervalSplitsForZone(zone);
                  return (
                    <div key={zone.key} className="rounded-lg border p-3">
                      <p className="font-medium">{zone.label}</p>
                      <p className="text-xl font-bold text-primary">{formatPace(zone.paceSecPerMile)}</p>
                      <p className="text-xs text-muted-foreground">{zone.description}</p>
                      {splits.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                          {splits.map((s) => `${s.label} ${formatTime(s.seconds)}`).join(' · ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Couldn't estimate paces from that result.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
