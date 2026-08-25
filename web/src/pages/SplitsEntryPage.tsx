import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, WifiOff, Download, Upload, Printer, ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { useRaceSplits, useSaveSplitsBatch } from '@/hooks/useSplits';
import { SplitCell, type CellNavigate } from '@/components/splits/SplitCell';
import { FieldHeader } from '@/components/field/FieldHeader';
import { SegmentedPills } from '@/components/field/SegmentedPills';
import { formatTime, parseTimeToSeconds, formatDateShort } from '@/lib/formatUtils';
import { parseCsv, toCsv } from '@/lib/csvParse';
import { SPLIT_PATTERN_LABEL, SPLIT_PATTERN_BADGE_CLASS, formatSplitMMSS } from '@/lib/splitPatternDisplay';
import type { RaceSplitRow, BatchSplitEntry, SplitEntryInput, PreviousSameDistanceComparison } from '@/types/splits';

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// C6 (LeadPack Master Build Handoff): the full-screen splits entry grid.
// Standalone outside <Layout /> (see router/index.tsx), same pattern as
// RaceVisualizationPage/IntervalSessionsPage. Column-major navigation (fill
// one marker down through every athlete, then move to the next marker) is
// the actual workflow a coach uses reading times off a stopwatch/clock —
// "the difference between eight minutes and an hour" for a 40-athlete team.

type SaveState = 'idle' | 'queued' | 'saving' | 'saved' | 'error';
const AUTOSAVE_DEBOUNCE_MS = 800;
// Display-label purposes only (the "Final (x.xxmi)" header) — not part of
// any split derivation, that's all server-side in lib/splitMath.js.
const MILE_METERS = 1609.34;

const headerCellClass =
  'sticky top-0 z-10 bg-muted p-2 font-medium whitespace-nowrap border-b border-border';
const derivedCellClass = 'p-2 text-center font-mono text-xs text-muted-foreground bg-muted/40 whitespace-nowrap';
// Reference columns (computed segments, pace, pattern) — worth the width
// on a laptop, but on a phone they'd crowd out the one column the coach is
// actually typing into. The active marker's own segment is surfaced under
// its input instead, so the sanity check a coach relies on stays visible.
const hiddenOnMobile = 'hidden md:table-cell';

function cellKey(resultId: string, sequence: number) {
  return `${resultId}:${sequence}`;
}

// Faster/slower than this athlete's most recent other race at roughly the
// same distance (backend/lib/distance bucketing — see routes/splits.js's
// GET /race/:raceId). Print-view and interactive-grid finish cells both
// use this so the two never show it differently.
const FinishComparisonIndicator: React.FC<{ previous: PreviousSameDistanceComparison | null }> = ({ previous }) => {
  if (!previous) return null;
  const faster = previous.deltaSec < 0;
  const slower = previous.deltaSec > 0;
  const title = `${formatSplitMMSS(Math.abs(previous.deltaSec))} ${faster ? 'faster' : slower ? 'slower' : 'even'} than ${previous.raceName} (${formatDateShort(previous.date)})`;
  return (
    <span
      className={`inline-flex items-center ${faster ? 'text-emerald-600' : slower ? 'text-destructive' : 'text-muted-foreground'}`}
      title={title}
    >
      {faster && <ArrowDown className="h-3 w-3" />}
      {slower && <ArrowUp className="h-3 w-3" />}
    </span>
  );
};

const SplitsEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const { raceId } = useParams<{ raceId: string }>();
  const { data, isLoading } = useRaceSplits(raceId ?? null);
  const saveBatch = useSaveSplitsBatch(raceId ?? null);

  const [genderFilter, setGenderFilter] = useState<'M' | 'F'>('M');
  const [rowSaveState, setRowSaveState] = useState<Record<string, SaveState>>({});
  const [offline, setOffline] = useState(false);
  // Mobile only — which marker column the narrow layout is showing. Six
  // marker columns plus derived/pace/pattern is a spreadsheet, not a phone
  // screen; below `md` this page shows one marker at a time, same active-
  // column idea as IntervalSessionManagePage's reps. Column-major
  // navigation keeps it in sync as the coach runs down the roster.
  const [activeMarkerIdx, setActiveMarkerIdx] = useState(0);

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

  // Every marker beyond the first is entered as a cumulative clock time
  // (see lib/splitMath.js's header comment) but the segment it implies —
  // and the closing segment to the tape, and overall pace — are exactly
  // what a coach expects to see right there next to it, gray and
  // uneditable, not something they have to compute by hand or go looking
  // for. The first marker has no separate "segment" column since its
  // segment IS the entered value (distance from the gun).
  const derivedMarkers = useMemo(() => markers.slice(1), [markers]);
  const closingMiles = useMemo(() => {
    if (!data?.distanceMeters || markers.length === 0) return null;
    return (data.distanceMeters - markers[markers.length - 1].markerMeters) / MILE_METERS;
  }, [data, markers]);
  // Whole-mile numbering, matching the same "Mile N" / "NK" convention
  // lib/splitMath.js already uses for the real markers — a 5K's closing
  // segment (really 1.11mi) reads as "Mile 3," exactly how a coach's own
  // sheet already labels it, not as a fussy "Final (1.11mi)."
  const closingLabel = useMemo(() => {
    if (data?.splitMarkerScheme === 'KM') return `${markers.length + 1}K`;
    if (data?.splitMarkerScheme === 'CUSTOM') return 'Final';
    return `Mile ${markers.length + 1}`;
  }, [data, markers]);
  const totalCols = 1 + markers.length + derivedMarkers.length + 1 + 1 + 1 + 1;

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
      if (!draft || draft.size === 0) return;

      // Send only what's actually been touched since the last successful
      // save — never row.splits merged in, which could be a stale cache
      // snapshot. The backend leaves every sequence this entry doesn't
      // mention untouched, so there's no need (and no safe way) to
      // reconstruct "the whole row" here; doing so risks resending a
      // stale value for a marker another coach just saved and silently
      // reverting it. Snapshotted so a value typed into this same row
      // while this request is in flight isn't swept up and marked done
      // early — only what this specific save covers gets cleared below.
      const snapshot = new Map(draft);
      const splits = [...snapshot.entries()]
        .sort(([a], [b]) => a - b)
        .map(([sequence, elapsedSec]) => ({ sequence, elapsedSec }));

      setRowSaveState((prev) => ({ ...prev, [resultId]: 'saving' }));
      try {
        const result = await saveBatch.mutateAsync([{ resultId, splits }]);
        const liveDraft = draftRef.current.get(resultId);
        if (liveDraft) {
          for (const [sequence, value] of snapshot.entries()) {
            if (liveDraft.get(sequence) === value) liveDraft.delete(sequence);
          }
        }
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

      // Keeps the mobile one-column view following the same cursor the
      // keyboard is moving, so running off the bottom of Mile 1 lands on
      // Mile 2 rather than focusing a cell that's display:none.
      setActiveMarkerIdx(targetCol);
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

  const handlePrint = () => {
    flushAll();
    window.print();
  };

  // C7: export produces exactly what import consumes — one Athlete column
  // to match rows back up, one column per raw marker entry (the derived
  // segment/Final/Pace columns are included too, for reference, but import
  // ignores anything that isn't a real marker label). A coach can pull
  // this into a spreadsheet at the track, fill it in from a paper sheet,
  // and bring it back rather than typing 40 rows one cell at a time on a
  // phone.
  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'Athlete',
      'Gender',
      ...markers.map((m) => m.label),
      ...derivedMarkers.map((m) => `${m.label} split`),
      'Final',
      'Pace',
      'Finish',
    ];
    const csvRows = rowsAll.map((row) => {
      const bySequence = new Map(row.splits.map((s) => [s.sequence, s.elapsedSec]));
      const closingSeg = row.segments.find((s) => s.isClosing);
      const obj: Record<string, string> = {
        Athlete: row.athleteName,
        Gender: row.gender ?? '',
        Final: closingSeg ? formatSplitMMSS(closingSeg.segmentSec) : '',
        Pace: row.overallPaceSecPerMile != null ? formatSplitMMSS(row.overallPaceSecPerMile) : '',
        Finish: formatSplitMMSS(row.finishSec),
      };
      markers.forEach((m) => {
        obj[m.label] = formatSplitMMSS(bySequence.get(m.sequence));
      });
      derivedMarkers.forEach((m) => {
        const seg = row.segments.find((s) => s.sequence === m.sequence && !s.isClosing);
        obj[`${m.label} split`] = seg ? formatSplitMMSS(seg.segmentSec) : '';
      });
      return obj;
    });
    const safeName = (data.raceName || 'splits').replace(/[^\w-]+/g, '_');
    downloadCsv(`${safeName}-splits.csv`, toCsv(headers, csvRows));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const text = await readFileAsText(file);
    const { headers: csvHeaders, rows: parsedRows } = parseCsv(text);
    const markerColByLabel = new Map(markers.map((m) => [m.label, m.sequence]));
    const nameToResultId = new Map(rowsAll.map((r) => [r.athleteName.trim().toLowerCase(), r.resultId]));
    // Match the Athlete column by name case-insensitively rather than
    // requiring the literal header "Athlete" — a coach's own spreadsheet
    // (or one they hand-edited from our export) might call it "Name" or
    // lowercase it, and the name is always the first column in practice.
    const athleteHeader =
      csvHeaders.find((h) => /^(athlete|name|runner)s?$/i.test(h.trim())) ?? csvHeaders[0] ?? 'Athlete';

    const entries: BatchSplitEntry[] = [];
    const errors: string[] = [];

    for (const parsedRow of parsedRows) {
      const name = (parsedRow[athleteHeader] ?? '').trim();
      if (!name) continue;
      const resultId = nameToResultId.get(name.toLowerCase());
      if (!resultId) {
        errors.push(`No match for "${name}"`);
        continue;
      }

      const splits: SplitEntryInput[] = [];
      for (const [label, sequence] of markerColByLabel.entries()) {
        const raw = (parsedRow[label] ?? '').trim();
        if (!raw) continue;
        const sec = raw.includes(':') ? parseTimeToSeconds(raw) : Number(raw);
        if (!Number.isFinite(sec) || sec <= 0) {
          errors.push(`${name}: couldn't read "${label}" value "${raw}"`);
          continue;
        }
        splits.push({ sequence, elapsedSec: sec });
      }
      entries.push({ resultId, splits });
    }

    if (entries.length === 0) {
      toast.error(errors[0] ?? 'No matching athletes found in that file.');
      return;
    }

    try {
      const result = await saveBatch.mutateAsync(entries);
      toast.success(`Imported splits for ${entries.length} athlete${entries.length === 1 ? '' : 's'}.`);
      const allErrors = [...errors, ...result.flags.map((f) => `${f.resultId}: ${f.reason}`)];
      if (allErrors.length > 0) {
        toast.error(`${allErrors.length} row(s) had issues: ${allErrors.slice(0, 3).join('; ')}${allErrors.length > 3 ? '…' : ''}`);
      }
    } catch {
      toast.error('Import failed to save.');
    }
  };

  const topBar = (
    <>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
      <FieldHeader
        title={data?.raceName ?? 'Splits'}
        subtitle={
          offline ? (
            <span className="flex items-center gap-1 text-destructive">
              <WifiOff className="h-3 w-3" /> Offline — changes save when you're back
            </span>
          ) : (
            'Enter the clock time at each marker'
          )
        }
        actions={[
          { icon: Upload, label: 'Import', onClick: handleImportClick, disabled: markers.length === 0 },
          { icon: Download, label: 'Export', onClick: handleExportCsv, disabled: markers.length === 0 },
          { icon: Printer, label: 'Print', onClick: handlePrint, disabled: markers.length === 0 },
          { icon: Check, label: 'Save', onClick: handleSave },
          { icon: X, label: 'Close', onClick: handleClose, variant: 'ghost' },
        ]}
      />
    </>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-4 text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!data || !data.distanceMeters) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-4 text-muted-foreground">
          This race doesn't have a distance set — fix that first, then come back to enter splits.
        </div>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-4 text-muted-foreground">
          This race is too short for a marker split (finish is closer than {400}m past the last mile/km) — splits
          don't apply here.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="print:hidden space-y-3 p-3 sm:p-4">
        {availableGenders.size > 1 && (
          <SegmentedPills
            caption="Race"
            segments={(['F', 'M'] as const)
              .filter((g) => availableGenders.has(g))
              .map((g) => ({
                value: g,
                label: g === 'F' ? 'Girls' : 'Boys',
                badge: rowsAll.filter((r) => (r.gender ?? 'M') === g).length,
              }))}
            value={genderFilter}
            onChange={(v) => setGenderFilter(v as 'M' | 'F')}
          />
        )}

        {/* Below `md` the grid shows one marker column at a time — these
            pills are how you move between them (and they track the
            keyboard cursor, see handleNavigate). Hidden from `md` up,
            where every column is on screen anyway. */}
        {markers.length > 1 && (
          <SegmentedPills
            className="md:hidden"
            caption="Marker"
            segments={markers.map((m, i) => ({ value: String(i), label: m.label }))}
            value={String(activeMarkerIdx)}
            onChange={(v) => setActiveMarkerIdx(Number(v))}
          />
        )}

        <div className="max-h-[calc(100vh-210px)] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${headerCellClass} text-left`}>Athlete</th>
                {markers.map((m, i) => (
                  <th
                    key={m.sequence}
                    className={`${headerCellClass} w-28 text-center ${i === activeMarkerIdx ? '' : 'hidden md:table-cell'}`}
                  >
                    {m.label}
                  </th>
                ))}
                {derivedMarkers.map((m) => (
                  <th key={`derived-${m.sequence}`} className={`${headerCellClass} ${hiddenOnMobile} w-24 text-center`}>
                    {m.label} split
                  </th>
                ))}
                <th
                  className={`${headerCellClass} ${hiddenOnMobile} w-28 text-center`}
                  title={closingMiles != null ? `${closingMiles.toFixed(2)} miles from the last marker to the tape` : undefined}
                >
                  {closingLabel}
                </th>
                <th className={`${headerCellClass} ${hiddenOnMobile} w-24 text-center`}>Pace</th>
                <th className={`${headerCellClass} text-right`}>Finish</th>
                <th className={`${headerCellClass} ${hiddenOnMobile} text-left`}>Pattern</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: RaceSplitRow) => {
                const state = rowSaveState[row.resultId] ?? 'idle';
                const closingSeg = row.segments.find((s) => s.isClosing);
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
                    {markers.map((m, i) => {
                      const existing = row.splits.find((s) => s.sequence === m.sequence);
                      const active = i === activeMarkerIdx;
                      // The segment this marker implies — shown under the
                      // input on mobile only, where the standalone derived
                      // column is hidden.
                      const seg = row.segments.find((s) => s.sequence === m.sequence && !s.isClosing);
                      return (
                        <td key={m.sequence} className={`w-28 p-1 ${active ? '' : 'hidden md:table-cell'}`}>
                          <SplitCell
                            cellKey={cellKey(row.resultId, m.sequence)}
                            value={existing?.elapsedSec ?? null}
                            saveState={state}
                            registerRef={registerRef}
                            onComplete={handleComplete}
                            onClear={handleClear}
                            onNavigate={handleNavigate}
                            className="h-11 text-base md:h-9 md:text-sm"
                          />
                          {seg && (
                            <p className="mt-0.5 text-center font-mono text-[10px] text-muted-foreground md:hidden">
                              +{formatSplitMMSS(seg.segmentSec)}
                            </p>
                          )}
                        </td>
                      );
                    })}
                    {derivedMarkers.map((m) => {
                      const seg = row.segments.find((s) => s.sequence === m.sequence && !s.isClosing);
                      return (
                        <td key={`derived-${m.sequence}`} className={`${derivedCellClass} ${hiddenOnMobile}`}>
                          {seg ? formatSplitMMSS(seg.segmentSec) : '—'}
                        </td>
                      );
                    })}
                    <td className={`${derivedCellClass} ${hiddenOnMobile}`}>
                      {closingSeg ? formatSplitMMSS(closingSeg.segmentSec) : '—'}
                    </td>
                    <td className={`${derivedCellClass} ${hiddenOnMobile}`}>
                      {row.overallPaceSecPerMile != null ? `${formatSplitMMSS(row.overallPaceSecPerMile)}/mi` : '—'}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right align-middle font-mono">
                      <span className="inline-flex items-center gap-1">
                        {row.finishSec != null ? formatTime(row.finishSec) : '—'}
                        <FinishComparisonIndicator previous={row.previousSameDistance} />
                      </span>
                    </td>
                    <td className={`${hiddenOnMobile} whitespace-nowrap p-2 align-middle`}>
                      {row.analysis ? (
                        <Badge variant="outline" className={SPLIT_PATTERN_BADGE_CLASS[row.analysis.pattern]}>
                          {SPLIT_PATTERN_LABEL[row.analysis.pattern]}
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
                  <td colSpan={totalCols} className="p-6 text-center text-muted-foreground">
                    No {genderFilter === 'F' ? 'girls' : 'boys'} results for this race.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print view: plain formatted cells (not the interactive grid), both
          genders in their own section, so a printed sheet reads like a
          real meet results page rather than a screenshot of input boxes. */}
      <div className="hidden print:block p-4">
        <h1 className="text-lg font-semibold mb-3">{data.raceName}</h1>
        {(['F', 'M'] as const)
          .filter((g) => availableGenders.has(g) || (availableGenders.size === 0 && g === genderFilter))
          .map((g) => {
            const groupRows = rowsAll.filter((r) => (r.gender ?? 'M') === g);
            if (groupRows.length === 0) return null;
            return (
              <div key={g} className="mb-6 break-inside-avoid">
                <h2 className="text-sm font-semibold mb-1">{g === 'F' ? 'Girls' : 'Boys'}</h2>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-1 border border-border">Athlete</th>
                      {markers.map((m) => (
                        <th key={m.sequence} className="text-center p-1 border border-border">
                          {m.label}
                        </th>
                      ))}
                      {derivedMarkers.map((m) => (
                        <th key={`derived-${m.sequence}`} className="text-center p-1 border border-border">
                          {m.label} split
                        </th>
                      ))}
                      <th className="text-center p-1 border border-border">{closingLabel}</th>
                      <th className="text-center p-1 border border-border">Pace</th>
                      <th className="text-right p-1 border border-border">Finish</th>
                      <th className="text-left p-1 border border-border">Pattern</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((row) => {
                      const closingSeg = row.segments.find((s) => s.isClosing);
                      return (
                        <tr key={row.resultId}>
                          <td className="p-1 border border-border whitespace-nowrap">{row.athleteName}</td>
                          {markers.map((m) => {
                            const existing = row.splits.find((s) => s.sequence === m.sequence);
                            return (
                              <td key={m.sequence} className="text-center p-1 border border-border font-mono">
                                {formatSplitMMSS(existing?.elapsedSec) || '—'}
                              </td>
                            );
                          })}
                          {derivedMarkers.map((m) => {
                            const seg = row.segments.find((s) => s.sequence === m.sequence && !s.isClosing);
                            return (
                              <td key={`derived-${m.sequence}`} className="text-center p-1 border border-border font-mono">
                                {seg ? formatSplitMMSS(seg.segmentSec) : '—'}
                              </td>
                            );
                          })}
                          <td className="text-center p-1 border border-border font-mono">
                            {closingSeg ? formatSplitMMSS(closingSeg.segmentSec) : '—'}
                          </td>
                          <td className="text-center p-1 border border-border font-mono">
                            {row.overallPaceSecPerMile != null ? `${formatSplitMMSS(row.overallPaceSecPerMile)}/mi` : '—'}
                          </td>
                          <td className="text-right p-1 border border-border font-mono">
                            {row.finishSec != null ? formatTime(row.finishSec) : '—'}
                            {row.previousSameDistance && (
                              <span className={row.previousSameDistance.deltaSec < 0 ? 'text-emerald-700' : 'text-red-700'}>
                                {' '}
                                {row.previousSameDistance.deltaSec < 0 ? '▼' : '▲'}
                              </span>
                            )}
                          </td>
                          <td className="text-left p-1 border border-border">
                            {row.analysis ? SPLIT_PATTERN_LABEL[row.analysis.pattern] : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default SplitsEntryPage;
