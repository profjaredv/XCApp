import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useRaceSplits, useSaveSplitsBatch } from '@/hooks/useSplits';
import { SplitCell, type CellNavigate } from '@/components/splits/SplitCell';
import { formatTime } from '@/lib/formatUtils';
import type { RaceSplitRow, SplitPattern } from '@/types/splits';

// C6 (LeadPack Master Build Handoff): the full-screen splits entry grid.
// Standalone outside <Layout /> (see router/index.tsx), same pattern as
// RaceVisualizationPage/IntervalSessionsPage. Column-major navigation (fill
// one marker down through every athlete, then move to the next marker) is
// the actual workflow a coach uses reading times off a stopwatch/clock —
// "the difference between eight minutes and an hour" for a 40-athlete team.

type SaveState = 'idle' | 'queued' | 'saving' | 'saved' | 'error';
const AUTOSAVE_DEBOUNCE_MS = 800;

const PATTERN_LABEL: Record<SplitPattern, string> = {
  negative: 'Negative split',
  even: 'Even split',
  positive: 'Positive split',
};
const PATTERN_CLASS: Record<SplitPattern, string> = {
  negative: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  even: 'bg-muted text-muted-foreground border-border',
  positive: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
};

function cellKey(resultId: string, sequence: number) {
  return `${resultId}:${sequence}`;
}

const SplitsEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const { raceId } = useParams<{ raceId: string }>();
  const { data, isLoading } = useRaceSplits(raceId ?? null);
  const saveBatch = useSaveSplitsBatch(raceId ?? null);

  const [genderFilter, setGenderFilter] = useState<'M' | 'F'>('M');
  const [rowSaveState, setRowSaveState] = useState<Record<string, SaveState>>({});
  const [offline, setOffline] = useState(false);

  // Per-row draft of what's currently entered, keyed sequence -> value or
  // null for "cleared". Only sequences a coach has actually touched appear
  // here; everything else falls back to the last known server value from
  // the query cache. A ref (not state) — updated on every keystroke commit,
  // read only when a debounce fires, so it never drives a re-render itself.
  const draftRef = useRef<Map<string, Map<number, number | null>>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const retryQueueRef = useRef<Set<string>>(new Set());

  const registerRef = useCallback((key: string, el: HTMLInputElement | null) => {
    cellRefs.current.set(key, el);
  }, []);

  const rowsAll = useMemo(() => data?.results ?? [], [data]);
  const markers = useMemo(() => data?.markers ?? [], [data]);

  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    for (const r of rowsAll) if (r.gender) set.add(r.gender);
    return set;
  }, [rowsAll]);

  useEffect(() => {
    if (availableGenders.size > 0 && !availableGenders.has(genderFilter)) {
      setGenderFilter(availableGenders.has('F') ? 'F' : 'M');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableGenders]);

  const rows = useMemo(
    () => rowsAll.filter((r) => (r.gender ?? 'M') === genderFilter),
    [rowsAll, genderFilter]
  );

  const rowById = useMemo(() => new Map(rowsAll.map((r) => [r.resultId, r])), [rowsAll]);

  const performSave = useCallback(
    async (resultId: string) => {
      const row = rowById.get(resultId);
      if (!row) return;
      const draft = draftRef.current.get(resultId);

      const bySequence = new Map<number, number>();
      for (const s of row.splits) bySequence.set(s.sequence, s.elapsedSec);
      if (draft) {
        for (const [sequence, value] of draft.entries()) {
          if (value == null) bySequence.delete(sequence);
          else bySequence.set(sequence, value);
        }
      }
      const splits = [...bySequence.entries()]
        .sort(([a], [b]) => a - b)
        .map(([sequence, elapsedSec]) => ({ sequence, elapsedSec }));

      setRowSaveState((prev) => ({ ...prev, [resultId]: 'saving' }));
      try {
        const result = await saveBatch.mutateAsync([{ resultId, splits }]);
        retryQueueRef.current.delete(resultId);
        setOffline(false);
        const flagged = result.flags.some((f) => f.resultId === resultId);
        setRowSaveState((prev) => ({ ...prev, [resultId]: flagged ? 'error' : 'saved' }));
        if (flagged) {
          const reasons = result.flags.filter((f) => f.resultId === resultId).map((f) => f.reason);
          toast.error(`Split flagged for ${row.athleteName}: ${reasons[0]}`);
        } else {
          setTimeout(() => {
            setRowSaveState((prev) => (prev[resultId] === 'saved' ? { ...prev, [resultId]: 'idle' } : prev));
          }, 1500);
        }
      } catch {
        retryQueueRef.current.add(resultId);
        setOffline(true);
        setRowSaveState((prev) => ({ ...prev, [resultId]: 'error' }));
      }
    },
    [rowById, saveBatch]
  );

  const scheduleSave = useCallback(
    (resultId: string) => {
      setRowSaveState((prev) => ({ ...prev, [resultId]: 'queued' }));
      const existing = timersRef.current.get(resultId);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        resultId,
        setTimeout(() => {
          timersRef.current.delete(resultId);
          void performSave(resultId);
        }, AUTOSAVE_DEBOUNCE_MS)
      );
    },
    [performSave]
  );

  const setDraftValue = useCallback((resultId: string, sequence: number, value: number | null) => {
    let rowDraft = draftRef.current.get(resultId);
    if (!rowDraft) {
      rowDraft = new Map();
      draftRef.current.set(resultId, rowDraft);
    }
    rowDraft.set(sequence, value);
  }, []);

  const handleComplete = useCallback(
    (key: string, elapsedSec: number) => {
      const [resultId, sequenceStr] = key.split(':');
      setDraftValue(resultId, Number(sequenceStr), elapsedSec);
      scheduleSave(resultId);
    },
    [setDraftValue, scheduleSave]
  );

  const handleClear = useCallback(
    (key: string) => {
      const [resultId, sequenceStr] = key.split(':');
      const sequence = Number(sequenceStr);
      const row = rowById.get(resultId);
      const hadValue = row?.splits.some((s) => s.sequence === sequence) || draftRef.current.get(resultId)?.get(sequence) != null;
      if (!hadValue) return;
      setDraftValue(resultId, sequence, null);
      scheduleSave(resultId);
    },
    [rowById, setDraftValue, scheduleSave]
  );

  // Column-major: for a fixed marker column, "down" moves to the next
  // athlete row; running off the bottom moves to the top of the next
  // marker column. That is the exact order a coach reads splits off a
  // stopwatch in — one marker at a time, straight down the roster.
  const handleNavigate = useCallback(
    (key: string, direction: CellNavigate) => {
      const [resultId, sequenceStr] = key.split(':');
      const sequence = Number(sequenceStr);
      const rowIdx = rows.findIndex((r) => r.resultId === resultId);
      const colIdx = markers.findIndex((m) => m.sequence === sequence);
      if (rowIdx === -1 || colIdx === -1) return;

      let targetRow = rowIdx;
      let targetCol = colIdx;

      if (direction === 'left') {
        targetCol = colIdx - 1;
      } else if (direction === 'right') {
        targetCol = colIdx + 1;
      } else {
        const flat = colIdx * rows.length + rowIdx + (direction === 'down' ? 1 : -1);
        if (flat < 0 || flat >= rows.length * markers.length) return;
        targetCol = Math.floor(flat / rows.length);
        targetRow = flat % rows.length;
      }

      if (targetCol < 0 || targetCol >= markers.length || targetRow < 0 || targetRow >= rows.length) return;

      const targetKey = cellKey(rows[targetRow].resultId, markers[targetCol].sequence);
      const el = cellRefs.current.get(targetKey);
      if (el) {
        el.focus();
        el.select();
      }
    },
    [rows, markers]
  );

  const flushAll = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    for (const [resultId, timer] of timersRef.current.entries()) {
      clearTimeout(timer);
      timersRef.current.delete(resultId);
      void performSave(resultId);
    }
  }, [performSave]);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      for (const resultId of retryQueueRef.current) void performSave(resultId);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [performSave]);

  useEffect(() => {
    const anyPending = () =>
      Object.values(rowSaveState).some((s) => s === 'queued' || s === 'saving' || s === 'error');
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (anyPending()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [rowSaveState]);

  const handleClose = () => {
    const pending = Object.values(rowSaveState).some((s) => s === 'queued' || s === 'saving' || s === 'error');
    if (pending && !window.confirm('Some splits are still saving. Leave anyway?')) return;
    navigate(-1);
  };

  const handleSave = () => {
    flushAll();
    toast.success('Saving splits…');
  };

  const topBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
      <div>
        <h1 className="text-lg font-semibold">{data?.raceName ?? 'Splits'}</h1>
        {offline && (
          <p className="flex items-center gap-1 text-xs text-destructive mt-0.5">
            <WifiOff className="h-3 w-3" /> Offline — changes will save once you're back online.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleSave}>
          <Check className="h-4 w-4 mr-1" />
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClose}>
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!data || !data.distanceMeters) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">
          This race doesn't have a distance set — fix that first, then come back to enter splits.
        </div>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">
          This race is too short for a marker split (finish is closer than {400}m past the last mile/km) — splits
          don't apply here.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Enter the clock time at each marker — segment times and pace are calculated for you.
          </p>
          {availableGenders.size > 1 && (
            <div className="flex items-center gap-1 ml-auto">
              {(['F', 'M'] as const)
                .filter((g) => availableGenders.has(g))
                .map((g) => (
                  <Button
                    key={g}
                    variant={genderFilter === g ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === 'F' ? 'Girls' : 'Boys'}
                  </Button>
                ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-[57px] bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-2 font-medium whitespace-nowrap">Athlete</th>
                {markers.map((m) => (
                  <th key={m.sequence} className="text-center p-2 font-medium whitespace-nowrap w-28">
                    {m.label}
                  </th>
                ))}
                <th className="text-right p-2 font-medium whitespace-nowrap">Finish</th>
                <th className="text-left p-2 font-medium whitespace-nowrap">Pattern</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: RaceSplitRow) => {
                const state = rowSaveState[row.resultId] ?? 'idle';
                return (
                  <tr key={row.resultId} className="border-b border-border last:border-0">
                    <td className="p-2 whitespace-nowrap font-medium align-middle">
                      <div className="flex items-center gap-1.5">
                        {row.athleteName}
                        {state === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {state === 'saved' && <Check className="h-3 w-3 text-emerald-600" />}
                        {state === 'error' && <X className="h-3 w-3 text-destructive" />}
                      </div>
                    </td>
                    {markers.map((m) => {
                      const existing = row.splits.find((s) => s.sequence === m.sequence);
                      return (
                        <td key={m.sequence} className="p-1 w-28">
                          <SplitCell
                            cellKey={cellKey(row.resultId, m.sequence)}
                            value={existing?.elapsedSec ?? null}
                            saveState={state}
                            registerRef={registerRef}
                            onComplete={handleComplete}
                            onClear={handleClear}
                            onNavigate={handleNavigate}
                          />
                        </td>
                      );
                    })}
                    <td className="p-2 text-right font-mono whitespace-nowrap align-middle">
                      {row.finishSec != null ? formatTime(row.finishSec) : '—'}
                    </td>
                    <td className="p-2 whitespace-nowrap align-middle">
                      {row.analysis ? (
                        <Badge variant="outline" className={PATTERN_CLASS[row.analysis.pattern]}>
                          {PATTERN_LABEL[row.analysis.pattern]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={markers.length + 3} className="p-6 text-center text-muted-foreground">
                    No {genderFilter === 'F' ? 'girls' : 'boys'} results for this race.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SplitsEntryPage;
