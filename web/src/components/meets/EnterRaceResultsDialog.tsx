import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRaceEntrants, useRaceResults, useSubmitRaceResults } from '@/hooks/useMeetOps';
import { type ResultStatus, type RaceResultEntry } from '@/api/meetOpsService';
import { rosterService } from '@/api/rosterService';
import { formatTime, parseTimeToSeconds } from '@/lib/formatUtils';
import { AthletePicker } from '../groups/AthletePicker';

// Enter or correct finish times for one race. Moved here verbatim from
// MeetDetailPage so the next shell's meet page (docs/leadpack-new-ui-
// trial.md §4.6, Results → Enter results manually) uses the same dialog.

const STATUS_OPTIONS: ResultStatus[] = ['FINISHED', 'DNF', 'DNS', 'DQ'];

interface ResultDraft {
  time: string;
  status: ResultStatus;
}

// The actual finish-time entry a manual race needs — distinct from
// "Enter splits" above, which only records intermediate mile markers for
// a Result that already exists. Pre-fills from whatever's already saved
// (works for correcting a scraped race's result too, not just manual
// ones); clearing a touched time field with no status override clears any
// existing result for that athlete, so un-filling a row removes it rather
// than saving a zero.
//
// Rows are this race's own field — entrants, plus anyone who already has
// a result (a scraped race never goes through the entrants system at
// all, so its results would otherwise be invisible here), plus anyone
// added via "Someone else ran too" below — not the entire season roster.
// Scrolling past everyone else on the team to find the dozen who ran one
// race was the whole complaint this replaces.
//
// Only the athlete/field combinations a coach actually edits in THIS
// dialog session are sent on save — not every row rebuilt from this
// dialog's own load-time snapshot. Two coaches with this dialog open on
// the same race at once, each entering different athletes (or even
// different fields for the same athlete), must not have one's save wipe
// the other's already-saved result back to blank just because it wasn't
// in whichever coach's snapshot loaded first — see backend POST
// /races/:raceId/results, which only writes keys actually present in
// each entry.
export const EnterRaceResultsDialog: React.FC<{
  raceId: string;
  raceName: string;
  seasonYear: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ raceId, raceName, seasonYear, open, onOpenChange }) => {
  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', seasonYear],
    queryFn: () => rosterService.getRoster(seasonYear ?? undefined),
    enabled: open && seasonYear != null,
  });
  const { data: entrants = [], isLoading: entrantsLoading } = useRaceEntrants(open ? raceId : null);
  const { data: raceResults, isLoading: resultsLoading } = useRaceResults(open ? raceId : null);
  const submitResults = useSubmitRaceResults(raceId);

  const [draft, setDraft] = useState<Record<string, ResultDraft>>({});
  // Which (athleteId, field) pairs this dialog session has actually
  // edited — the only things handleSave includes in its payload.
  const [touched, setTouched] = useState<Record<string, { time?: boolean; status?: boolean }>>({});
  // Added via "Someone else ran too" this session — beyond entrants and
  // existing results, for a manual race with nobody entered yet.
  const [addedAthleteIds, setAddedAthleteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !raceResults) return;
    const initial: Record<string, ResultDraft> = {};
    for (const r of raceResults.results) {
      initial[r.athleteId] = { time: r.time != null ? formatTime(r.time) : '', status: r.status };
    }
    setDraft(initial);
    setTouched({});
    setAddedAthleteIds([]);
  }, [open, raceResults]);

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const entrantNameById = useMemo(() => new Map(entrants.map((e) => [e.athleteId, e.name])), [entrants]);

  const rowIds = useMemo(() => {
    const ids = new Set<string>();
    entrants.forEach((e) => ids.add(e.athleteId));
    (raceResults?.results ?? []).forEach((r) => ids.add(r.athleteId));
    addedAthleteIds.forEach((id) => ids.add(id));
    return ids;
  }, [entrants, raceResults?.results, addedAthleteIds]);

  const rows = useMemo(
    () =>
      [...rowIds]
        .map((id) => {
          const entrantName = entrantNameById.get(id);
          if (entrantName) return { id, name: entrantName };
          const a = rosterById.get(id);
          return { id, name: a ? a.preferredName || a.name : id };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rowIds, entrantNameById, rosterById]
  );

  const availableToAdd = useMemo(
    () =>
      roster
        .filter((a) => !rowIds.has(a.id))
        .map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [roster, rowIds]
  );

  const setEntry = (athleteId: string, patch: Partial<ResultDraft>) => {
    setDraft((prev) => ({
      ...prev,
      [athleteId]: { time: prev[athleteId]?.time ?? '', status: prev[athleteId]?.status ?? 'FINISHED', ...patch },
    }));
    setTouched((prev) => ({
      ...prev,
      [athleteId]: { ...prev[athleteId], ...('time' in patch ? { time: true } : {}), ...('status' in patch ? { status: true } : {}) },
    }));
  };

  const handleAddAthlete = (athleteId: string) => setAddedAthleteIds((prev) => [...prev, athleteId]);

  const handleSave = async () => {
    const entries: RaceResultEntry[] = [...rowIds]
      .filter((id) => touched[id]?.time || touched[id]?.status)
      .map((id) => {
        const d = draft[id];
        const entry: RaceResultEntry = { athleteId: id };
        if (touched[id]?.time) {
          const timeStr = d?.time?.trim();
          const parsed = timeStr ? parseTimeToSeconds(timeStr) : NaN;
          entry.time = timeStr && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        if (touched[id]?.status) {
          entry.status = d?.status ?? 'FINISHED';
        }
        return entry;
      });
    if (entries.length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      const result = await submitResults.mutateAsync(entries);
      toast.success(`Saved ${result.saved} result${result.saved === 1 ? '' : 's'}${result.cleared ? `, cleared ${result.cleared}` : ''}.`);
      onOpenChange(false);
    } catch {
      toast.error('Could not save results.');
    }
  };

  const loading = rosterLoading || entrantsLoading || resultsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enter results — {raceName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nobody's entered in this race yet — add someone below to get started.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {rows.map((row) => {
              const d = draft[row.id] ?? { time: '', status: 'FINISHED' as ResultStatus };
              return (
                <div key={row.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                  <span className="flex-1 text-sm truncate">{row.name}</span>
                  <Input
                    className="w-24 font-mono"
                    placeholder="mm:ss"
                    value={d.time}
                    onChange={(e) => setEntry(row.id, { time: e.target.value })}
                  />
                  <Select value={d.status} onValueChange={(v) => setEntry(row.id, { status: v as ResultStatus })}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-medium">Someone else ran too</p>
          <AthletePicker
            athletes={availableToAdd}
            onPick={handleAddAthlete}
            disabled={loading}
            emptyLabel={roster.length === 0 ? 'No roster found for this season.' : 'Everyone on the roster already has a row here.'}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || rows.length === 0 || submitResults.isPending}>
            {submitResults.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
