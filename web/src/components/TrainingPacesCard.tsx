import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gauge } from 'lucide-react';
import { usePaceZones } from '@/hooks/usePaceZones';
import {
  MCMILLAN_ZONES,
  resolvePaceZones,
  equivalentRacePaceSecPerMile,
  type PaceZoneDefinition,
  type ResolvedPaceZone,
  type SourceRace,
} from '@/lib/paceZones';
import { formatPaceRange, describeRule, repTimeSec, formatRepTime, isRepeatZone } from '@/lib/paceFormat';
import { formatTime, formatDateShort } from '@/lib/formatUtils';
import { NerdBox } from '@/components/NerdBox';

export interface TrainingPaceRace {
  id: string;
  raceName: string;
  date: string;
  distance: number;
  time: number;
}

// "What pace should I be hitting?" — answered from the athlete's own most
// recent race, in the vocabulary their team actually uses.
//
// Two sets are shown, never merged: the standard McMillan-style zones every
// team gets, and whatever the team defined for itself in Settings. Merging
// them would be worse than useless — a team's "T" and the standard "T" are
// different definitions, and quietly showing one under the other's name is
// how an athlete ends up running the wrong workout.

// Track distances worth showing a rep time for. Only for zones fast enough
// that someone actually runs them as repeats — see repDistancesFor.
const REP_DISTANCES: Array<{ label: string; meters: number }> = [
  { label: '400m', meters: 400 },
  { label: '800m', meters: 800 },
  { label: '1200m', meters: 1200 },
  { label: 'Mile', meters: 1609.34 },
];

// Rep splits answer "what should my 800m be at T pace". That only makes
// sense for a zone you run ON a track in repeats — nobody hits a stopwatch
// every 800m of a recovery jog. Rather than guess from a zone's NAME (a
// coach picked it, and it could be anything), this keys off the pace
// relative to the athlete's own 5K — see isRepeatZone.
const ZoneCard: React.FC<{ zone: ResolvedPaceZone; fiveKPaceSecPerMile: number | null }> = ({
  zone,
  fiveKPaceSecPerMile,
}) => {
  const { definition, paces } = zone;
  const showReps =
    paces !== null &&
    fiveKPaceSecPerMile !== null &&
    isRepeatZone(paces.fastSecPerMile, fiveKPaceSecPerMile);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge variant="secondary">{definition.abbreviation}</Badge>
        <p className="font-medium">{definition.name}</p>
      </div>
      {paces ? (
        <p className="mt-1 text-xl font-bold text-primary">{formatPaceRange(paces)}</p>
      ) : (
        // A zone whose rule can't be resolved stays visible and says so.
        // Dropping it would leave a coach counting four zones where they
        // defined five, with no clue which one is broken.
        <p className="mt-1 text-sm italic text-muted-foreground">Can't calculate — check this zone's rule.</p>
      )}
      <p className="text-xs text-muted-foreground">{describeRule(definition)}</p>
      {definition.notes && (
        <p className="mt-1 text-xs italic text-muted-foreground">{definition.notes}</p>
      )}
      {paces && showReps && (
        <p className="mt-2 border-t pt-2 font-mono text-xs text-muted-foreground">
          {REP_DISTANCES.map((d) => {
            const fast = formatRepTime(repTimeSec(paces.fastSecPerMile, d.meters));
            const slow = formatRepTime(repTimeSec(paces.slowSecPerMile, d.meters));
            return `${d.label} ${fast === slow ? fast : `${fast}-${slow}`}`;
          }).join(' · ')}
        </p>
      )}
      {/* Last in the card, below the rep splits: the derivation is the
          meta content, and a coach reaching for a rep target should not
          have to scroll past six lines of algebra to find it. Renders
          nothing at all when nerd mode is off. */}
      <NerdBox explain={paces?.explain} />
    </div>
  );
};

const ZoneGrid: React.FC<{ zones: ResolvedPaceZone[]; fiveKPaceSecPerMile: number | null }> = ({
  zones,
  fiveKPaceSecPerMile,
}) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {zones.map((z) => (
      <ZoneCard key={z.definition.id} zone={z} fiveKPaceSecPerMile={fiveKPaceSecPerMile} />
    ))}
  </div>
);

export const TrainingPacesCard: React.FC<{ recentRaces: TrainingPaceRace[] }> = ({ recentRaces }) => {
  const [selectedRaceId, setSelectedRaceId] = useState('');
  const { data: teamZones } = usePaceZones();

  useEffect(() => {
    if (recentRaces.length > 0 && !recentRaces.some((r) => r.id === selectedRaceId)) {
      setSelectedRaceId(recentRaces[0].id);
    }
  }, [recentRaces, selectedRaceId]);

  const activeRace = recentRaces.find((r) => r.id === selectedRaceId);
  const source: SourceRace | null = activeRace
    ? { distanceMiles: activeRace.distance, timeSeconds: activeRace.time }
    : null;
  // The yardstick for "is this a zone you run as reps" — see isRepeatZone.
  const fiveKPace = source ? equivalentRacePaceSecPerMile(source, 5000) : null;

  const standard = source ? resolvePaceZones(MCMILLAN_ZONES, source) : [];
  const custom = source ? resolvePaceZones((teamZones ?? []) as PaceZoneDefinition[], source) : [];

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
      <CardContent className="space-y-5">
        {recentRaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No race results yet — training paces will appear here once there's a result.
          </p>
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

            {!source ? (
              <p className="text-sm text-muted-foreground">Couldn't estimate paces from that result.</p>
            ) : (
              <>
                {custom.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Your team's zones</h3>
                    <ZoneGrid zones={custom} fiveKPaceSecPerMile={fiveKPace} />
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {custom.length > 0 ? 'Standard zones' : 'Zones'}
                  </h3>
                  <ZoneGrid zones={standard} fiveKPaceSecPerMile={fiveKPace} />
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TrainingPacesCard;
