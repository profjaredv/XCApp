import React, { useState } from 'react';
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
import { formatTime } from '@/lib/formatUtils';
import type { TrainingPaceRace } from '@/components/TrainingPacesCard';
import { NerdBox } from '@/components/NerdBox';
import { cn } from '@/lib/utils';
import { Panel } from './Visual';

// Training paces for the next shell: the same zones and math as classic's
// TrainingPacesCard, laid out as tiles. Pick the source race from chips;
// tap a zone for its rule and rep splits. Team zones and the standard
// zones stay separate, as in classic.

const REP_DISTANCES: Array<{ label: string; meters: number }> = [
  { label: '400m', meters: 400 },
  { label: '800m', meters: 800 },
  { label: '1200m', meters: 1200 },
  { label: 'Mile', meters: 1609.34 },
];

const ZoneTiles: React.FC<{ zones: ResolvedPaceZone[]; selected: string | null; onSelect: (id: string) => void }> = ({ zones, selected, onSelect }) => (
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
    {zones.map((z) => (
      <button
        key={z.definition.id}
        type="button"
        onClick={() => onSelect(z.definition.id)}
        aria-pressed={selected === z.definition.id}
        className={cn(
          'min-w-0 rounded-2xl p-3 text-left ring-1 transition-colors',
          selected === z.definition.id ? 'bg-primary text-primary-foreground ring-primary' : 'bg-muted/50 ring-transparent hover:ring-border'
        )}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
              selected === z.definition.id ? 'bg-white/20' : 'bg-background text-muted-foreground'
            )}
          >
            {z.definition.abbreviation}
          </span>
          <span className="truncate text-xs font-medium">{z.definition.name}</span>
        </span>
        <span className="mt-1 block truncate text-lg font-bold tabular-nums">{z.paces ? formatPaceRange(z.paces) : 'Check rule'}</span>
      </button>
    ))}
  </div>
);

export const PacesPanel: React.FC<{ recentRaces: TrainingPaceRace[] }> = ({ recentRaces }) => {
  const [raceId, setRaceId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const { data: teamZones } = usePaceZones();
  const race = recentRaces.find((r) => r.id === raceId) ?? recentRaces[0];
  const source: SourceRace | null = race ? { distanceMiles: race.distance, timeSeconds: race.time } : null;
  const fiveK = source ? equivalentRacePaceSecPerMile(source, 5000) : null;
  const standard = source ? resolvePaceZones(MCMILLAN_ZONES, source) : [];
  const custom = source ? resolvePaceZones((teamZones ?? []) as PaceZoneDefinition[], source) : [];
  const all = [...custom, ...standard];
  const zone = all.find((z) => z.definition.id === zoneId) ?? null;
  const showReps = !!zone?.paces && fiveK !== null && isRepeatZone(zone.paces.fastSecPerMile, fiveK);

  return (
    <Panel title="Training paces">
      {recentRaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your paces show up here after your first race result.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Based on</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {recentRaces.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRaceId(r.id)}
                  aria-pressed={r.id === race?.id}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-2 text-sm font-medium',
                    r.id === race?.id ? 'bg-foreground text-background' : 'bg-muted hover:bg-accent'
                  )}
                >
                  <span className="tabular-nums">{formatTime(r.time)}</span>
                  <span className="ml-1.5 opacity-70">{r.raceName.length > 18 ? `${r.raceName.slice(0, 17)}…` : r.raceName}</span>
                </button>
              ))}
            </div>
          </div>
          {custom.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Your team's zones</p>
              <ZoneTiles zones={custom} selected={zoneId} onSelect={(id) => setZoneId(id === zoneId ? null : id)} />
            </div>
          )}
          <div className="space-y-2">
            {custom.length > 0 && <p className="text-xs font-semibold text-muted-foreground">Standard zones</p>}
            <ZoneTiles zones={standard} selected={zoneId} onSelect={(id) => setZoneId(id === zoneId ? null : id)} />
          </div>
          {zone ? (
            <div className="rounded-2xl bg-muted/50 p-3 text-sm">
              <p className="font-semibold">{zone.definition.name}</p>
              <p className="text-xs text-muted-foreground">{describeRule(zone.definition)}</p>
              {zone.definition.notes && <p className="mt-1 text-xs text-muted-foreground">{zone.definition.notes}</p>}
              {zone.paces && showReps && (
                <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                  {REP_DISTANCES.map((d) => {
                    const fast = formatRepTime(repTimeSec(zone.paces!.fastSecPerMile, d.meters));
                    const slow = formatRepTime(repTimeSec(zone.paces!.slowSecPerMile, d.meters));
                    return (
                      <div key={d.label} className="rounded-xl bg-background p-1.5">
                        <p className="text-[10px] text-muted-foreground">{d.label}</p>
                        <p className="text-xs font-semibold tabular-nums">{fast === slow ? fast : `${fast}–${slow}`}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <NerdBox explain={zone.paces?.explain} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tap a zone for its rule and rep splits. These are estimates; adjust for how you feel, the weather and the terrain.</p>
          )}
        </div>
      )}
    </Panel>
  );
};
