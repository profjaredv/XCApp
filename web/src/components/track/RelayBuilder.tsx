import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackService, type TrackEvent, type TrackGender, type TrackMeetRow, type TrackRosterAthlete } from '@/api/trackService';
import { formatMark } from '@/lib/trackFormat';
import { getApiErrorMessage } from '@/lib/apiError';

// Build or edit one relay squad: the event, which squad (A, B...), who runs
// each leg in order, and the time once it has been run. Next to it, the
// athletes with the best marks in the relay's open event, so the legs can
// be picked from what they have actually run.

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export const RelayBuilder: React.FC<{
  meetId: string;
  season: number;
  relayEvents: TrackEvent[];
  roster: TrackRosterAthlete[];
  editing: TrackMeetRow | null;
  onDone: () => void;
}> = ({ meetId, season, relayEvents, roster, editing, onDone }) => {
  const [eventId, setEventId] = useState(editing?.eventId ?? relayEvents[0]?.id ?? '');
  const [gender, setGender] = useState<TrackGender>(editing?.gender === 'F' ? 'F' : 'M');
  const [relayTeam, setRelayTeam] = useState(editing?.relayTeam ?? 'A');
  const [legs, setLegs] = useState<string[]>(() => [0, 1, 2, 3].map((i) => editing?.relayAthleteIds[i] ?? ''));
  const [mark, setMark] = useState(editing && editing.status === 'FINISHED' ? formatMark(editing.markValue, 'SECONDS') : editing && editing.status !== 'ENTERED' ? editing.status : '');
  const [place, setPlace] = useState(editing?.place ? String(editing.place) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId && relayEvents[0]) setEventId(relayEvents[0].id);
  }, [eventId, relayEvents]);

  const { data: suggestion } = useQuery({
    queryKey: ['track', 'relay-suggest', season, eventId, gender],
    queryFn: () => trackService.suggestRelay(season, eventId, gender),
    enabled: Boolean(eventId),
  });
  const bestById = new Map((suggestion?.candidates ?? []).map((c) => [c.athleteId, c.markValue]));
  const unit = suggestion?.legEvent?.unit ?? 'SECONDS';
  const pool = roster.filter((a) => (a.gender ?? gender) === gender);
  const label = (a: TrackRosterAthlete) => {
    const best = bestById.get(a.id);
    return best != null ? `${a.name} (${formatMark(best, unit)})` : a.name;
  };
  // Fastest in the open event first, then everyone else by name.
  const ordered = [...pool].sort((a, b) => (bestById.get(a.id) ?? Infinity) - (bestById.get(b.id) ?? Infinity) || a.name.localeCompare(b.name));

  const chosen = legs.filter(Boolean);
  const legTotal = chosen.length === 4 && chosen.every((id) => bestById.get(id) != null) ? chosen.reduce((sum, id) => sum + (bestById.get(id) as number), 0) : null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = { gender, relayTeam, athleteIds: chosen, mark, place };
      if (editing) await trackService.updateRelay(editing.id, input);
      else await trackService.createRelay(meetId, { eventId, ...input });
      onDone();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save that relay.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Relay event" value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={Boolean(editing)} className={selectClass}>
          {relayEvents.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select aria-label="Boys or girls" value={gender} onChange={(e) => setGender(e.target.value as TrackGender)} className={selectClass}>
          <option value="M">Boys</option>
          <option value="F">Girls</option>
        </select>
        <label className="flex items-center gap-1">
          Squad
          <Input aria-label="Squad" value={relayTeam} onChange={(e) => setRelayTeam(e.target.value)} className="w-16" />
        </label>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {legs.map((id, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-muted-foreground">Leg {i + 1}</span>
            <select
              aria-label={`Leg ${i + 1}`}
              value={id}
              onChange={(e) => setLegs((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))}
              className={`${selectClass} min-w-0 flex-1`}
            >
              <option value="">Not set</option>
              {ordered
                .filter((a) => a.id === id || !legs.includes(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                  </option>
                ))}
            </select>
          </li>
        ))}
      </ol>

      {suggestion?.legEvent && (
        <p className="text-muted-foreground">
          Times shown are season bests in the {suggestion.legEvent.name}.
          {legTotal != null && <> These four add up to {formatMark(legTotal, 'SECONDS')}.</>}
          {suggestion.projected != null && <> The four fastest add up to {formatMark(suggestion.projected, 'SECONDS')}.</>} Open times added together, so
          no flying starts or exchanges.{' '}
          {suggestion.candidates.length >= 4 && (
            <button type="button" className="underline" onClick={() => setLegs(suggestion.candidates.slice(0, 4).map((c) => c.athleteId as string))}>
              Use the four fastest
            </button>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Relay time" placeholder="Time, once run (44.52)" value={mark} onChange={(e) => setMark(e.target.value)} className="w-52" />
        <Input aria-label="Place" placeholder="Place" value={place} onChange={(e) => setPlace(e.target.value)} className="w-20" />
        <Button type="button" size="sm" onClick={save} disabled={busy || !eventId}>
          {editing ? 'Save relay' : 'Add relay'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
};
