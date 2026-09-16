import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Play, RotateCcw, Square, Flag, UserPlus, X } from 'lucide-react';
import { useRaceResults, useSubmitRaceResults, useRaceEntrants, useAddEntrant } from '@/hooks/useMeetOps';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { ManageEntrantsDialog } from '@/components/meets/ManageEntrantsDialog';
import { FieldHeader } from '@/components/field/FieldHeader';
import { SegmentedPills } from '@/components/field/SegmentedPills';
import { fastestFirstPaceSecPerMile } from '@/api/groupService';
import { firstNameOf, lastNameOf } from '@/lib/athleteSearch';
import { anchorFor, elapsedSince } from '@/lib/stopwatch';
import {
  orderCaptures,
  nextUnnamedId,
  unnamedCount,
  assignCapture,
  unassignCapture,
  removeCapture,
  remainingAthletes,
  remainingBy,
  newCaptureId,
  type Capture,
} from '@/lib/captureTimer';

// The Live Timer, capture-first.
//
// It was name-first: a grid of every entrant, tap whoever just crossed.
// That works for a handful and fails on a real heat — at the chute you
// cannot scan sixty names fast enough, and a missed tap is a time that
// cannot be recovered, because the order runners cross in is only
// observable once.
//
// So the button that matters takes no name: FINISH appends a capture at
// the current elapsed time, as fast as a coach can tap, and the list that
// builds up IS the finish order. Naming is an unhurried second pass with
// the remaining runners right there to tap through in order.
//
// Tapping a name mid-race still works and is still the fastest path when
// the coach does recognise someone — it isn't a separate mechanism, just a
// capture that arrives with its athleteId already filled in. One list, one
// ordering, whichever way identity showed up. See lib/captureTimer.ts.
//
// What tapping a name in the grid MEANS depends on one visible thing: if a
// capture row is selected (always the case once the clock is stopped and
// something is unnamed), the tap names that row; otherwise, while running,
// it records a new finish now. The banner above the grid says which, every
// time — this is the one genuinely ambiguous interaction on the page and
// it is never left to be inferred.
//
// Captures live in localStorage per race so a reload mid-heat loses
// nothing. A NAMED capture is also written through as a real Result
// immediately (same batch endpoint as everywhere else), so the durable
// record never waits on the naming pass finishing.

const CAPTURES_STORAGE_KEY = (raceId: string) => `xc_captures_${raceId}`;

function formatElapsed(ms: number): string {
  const totalDeci = Math.max(0, Math.floor(ms / 100));
  const mins = Math.floor(totalDeci / 600);
  const secs = Math.floor((totalDeci % 600) / 10);
  const deci = totalDeci % 10;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${deci}`;
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const RaceLiveTimerPage: React.FC = () => {
  const navigate = useNavigate();
  const { raceId } = useParams<{ raceId: string }>();
  const { data: raceResults } = useRaceResults(raceId ?? null);
  const seasonYear = raceResults?.race.season ?? null;
  const submitResults = useSubmitRaceResults(raceId ?? null);
  const { data: entrants = [], isLoading: entrantsLoading } = useRaceEntrants(raceId ?? null);
  const addEntrant = useAddEntrant(raceId ?? null);

  const { data: roster = [] } = useRosterWithRaces(seasonYear ?? undefined);

  // 'stopped' is distinct from 'idle': the clock is frozen but the elapsed
  // time and captures are still on screen, which is when the naming pass
  // happens. Reset is what actually clears the clock.
  const [phase, setPhase] = useState<'idle' | 'running' | 'stopped'>('idle');
  const [sortMode, setSortMode] = useState<'fastest' | 'first' | 'last'>('fastest');
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [entrantsDialogOpen, setEntrantsDialogOpen] = useState(false);

  const [captures, setCaptures] = useState<Capture[]>(() => {
    if (!raceId) return [];
    try {
      const raw = window.localStorage.getItem(CAPTURES_STORAGE_KEY(raceId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed
            .filter((c) => c && typeof c.id === 'string' && typeof c.timeSec === 'number')
            .map((c) => ({ id: c.id, timeSec: c.timeSec, athleteId: c.athleteId ?? null }))
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!raceId) return;
    try {
      window.localStorage.setItem(CAPTURES_STORAGE_KEY(raceId), JSON.stringify(captures));
    } catch {
      // Private browsing, or storage blocked — captures still live in this
      // tab's state, they just won't survive a reload.
    }
  }, [raceId, captures]);

  // Which capture the name grid is currently naming. Explicit selection
  // wins; otherwise, once the clock is stopped, the earliest unnamed row
  // is targeted automatically so the naming pass needs no setup tap.
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const autoTargetId = phase === 'running' ? null : nextUnnamedId(captures);
  const assigningId =
    selectedCaptureId && captures.some((c) => c.id === selectedCaptureId) ? selectedCaptureId : autoTargetId;

  const [pendingByAthlete, setPendingByAthlete] = useState<Record<string, number | null>>({});
  const clearPending = useCallback((athleteId: string) => {
    setPendingByAthlete((prev) => {
      if (!(athleteId in prev)) return prev;
      const next = { ...prev };
      delete next[athleteId];
      return next;
    });
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);


  // Wake-up resync. Background throttling can hold the interval for a
  // minute or more, so without this the first thing a coach sees on
  // unlocking the phone is a stale time that then jumps. Deps are just the
  // phase; setElapsedMs takes an updater, so nothing here can feed back.
  useEffect(() => {
    if (phase !== 'running') return;
    const sync = () => setElapsedMs((prev) => elapsedSince(startRef.current, prev));
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, [phase]);

  const handleStart = () => {
    startRef.current = anchorFor(elapsedMs);
    setPhase('running');
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(
      () => setElapsedMs((prev) => elapsedSince(startRef.current, prev)),
      100
    );
  };

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('stopped');
  };

  // Clears the clock only. Captures survive on purpose — the times are the
  // irreplaceable part, and a coach who taps Reset while rows are still
  // unnamed has not asked to throw those away.
  const handleReset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsedMs(0);
    setPhase('idle');
  };

  const resultByAthlete = useMemo(
    () => new Map((raceResults?.results ?? []).map((r) => [r.athleteId, r.time])),
    [raceResults?.results]
  );

  const timeFor = useCallback(
    (athleteId: string): number | null =>
      athleteId in pendingByAthlete ? pendingByAthlete[athleteId] : (resultByAthlete.get(athleteId) ?? null),
    [pendingByAthlete, resultByAthlete]
  );

  const save = useCallback(
    (athleteId: string, time: number | null) => {
      setPendingByAthlete((prev) => ({ ...prev, [athleteId]: time }));
      submitResults.mutate([{ athleteId, time }], {
        onSuccess: () => clearPending(athleteId),
        onError: () => {
          clearPending(athleteId);
          toast.error(time == null ? 'Could not clear that time — try again.' : 'Could not save that time — try again.');
        },
      });
    },
    [submitResults, clearPending]
  );

  // The button that matters. No name, no confirmation, no per-press
  // disabled state — one press per runner crossing, as fast as they come.
  const handleFinish = () => {
    if (phase !== 'running') return;
    setCaptures((prev) => [...prev, { id: newCaptureId(), timeSec: Math.round(elapsedMs / 1000), athleteId: null }]);
  };

  // Name a capture, and write the result through immediately. assignCapture
  // moves an athlete off any row that already claimed them, so correcting
  // a mis-tap needs no extra step — but that vacated row's result has to
  // be cleared too, or the old time would linger on the server.
  const handleAssign = (captureId: string, athleteId: string) => {
    const capture = captures.find((c) => c.id === captureId);
    if (!capture) return;
    const displaced = captures.find((c) => c.athleteId === athleteId && c.id !== captureId);
    setCaptures((prev) => assignCapture(prev, captureId, athleteId));
    setSelectedCaptureId(null);
    if (displaced) save(athleteId, null);
    save(athleteId, capture.timeSec);
  };

  // Tapping a name while nothing is selected and the clock is running:
  // record a finish for them right now.
  const handleRecordNow = (athleteId: string) => {
    const timeSec = Math.round(elapsedMs / 1000);
    setCaptures((prev) => [...prev, { id: newCaptureId(), timeSec, athleteId }]);
    save(athleteId, timeSec);
  };

  // Tapping a name that already has a time: let the name go, keep the
  // time. The capture stays as an unnamed row rather than vanishing —
  // losing a time to a fat-fingered correction is the one thing this page
  // must never do.
  const handleClearAthlete = (athleteId: string) => {
    const owning = captures.find((c) => c.athleteId === athleteId);
    if (owning) setCaptures((prev) => unassignCapture(prev, owning.id));
    save(athleteId, null);
  };

  const handleDeleteCapture = (captureId: string) => {
    const capture = captures.find((c) => c.id === captureId);
    setCaptures((prev) => removeCapture(prev, captureId));
    if (capture?.athleteId) save(capture.athleteId, null);
    if (selectedCaptureId === captureId) setSelectedCaptureId(null);
  };

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    entrants.forEach((e) => map.set(e.athleteId, e.name));
    roster.forEach((a) => { if (!map.has(a.id)) map.set(a.id, a.preferredName || a.name); });
    return map;
  }, [entrants, roster]);

  // Fastest-first by default: pace order puts the runners most likely to
  // finish next at the top. Sorting only reorders this array — recorded
  // state is keyed by athleteId, never by position.
  const sortedEntrants = useMemo(() => {
    const withKeys = entrants.map((entrant) => {
      const athlete = rosterById.get(entrant.athleteId);
      return {
        entrant,
        pace: athlete ? fastestFirstPaceSecPerMile(athlete) : null,
        first: firstNameOf(entrant.name),
        last: lastNameOf(entrant.name),
      };
    });
    withKeys.sort((a, b) => {
      if (sortMode === 'first') return a.first.localeCompare(b.first) || a.entrant.name.localeCompare(b.entrant.name);
      if (sortMode === 'last') return a.last.localeCompare(b.last) || a.entrant.name.localeCompare(b.entrant.name);
      if (a.pace == null && b.pace == null) return a.entrant.name.localeCompare(b.entrant.name);
      if (a.pace == null) return 1;
      if (b.pace == null) return -1;
      return a.pace - b.pace;
    });
    return withKeys.map((w) => w.entrant);
  }, [entrants, rosterById, sortMode]);

  // In the naming pass the grid should only offer people still available —
  // scanning past names already used is the slowness this page exists to
  // remove. While recording, every entrant stays tappable (a recorded one
  // taps to clear).
  const timedElsewhere = useMemo(
    () => new Set(entrants.map((e) => e.athleteId).filter((id) => timeFor(id) != null)),
    [entrants, timeFor]
  );
  const gridEntrants = useMemo(
    () =>
      assigningId
        ? remainingBy(sortedEntrants, captures, timedElsewhere, (e) => e.athleteId)
        : sortedEntrants,
    [assigningId, sortedEntrants, captures, timedElsewhere]
  );

  const enteredIds = useMemo(() => new Set(entrants.map((e) => e.athleteId)), [entrants]);
  const availableToAdd = useMemo(
    () =>
      roster
        .filter((a) => !enteredIds.has(a.id))
        .map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [roster, enteredIds]
  );

  const handleAddEntrant = async (athleteId: string) => {
    try {
      await addEntrant.mutateAsync(athleteId);
    } catch {
      toast.error('Could not add that athlete.');
    }
  };

  // Naming from the full roster, not just entrants: an unnamed capture
  // might be a walk-on who was never declared.
  const assignableRoster = useMemo(
    () =>
      remainingAthletes(
        roster.map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
        captures,
        new Set(roster.map((a) => a.id).filter((id) => timeFor(id) != null))
      ),
    [roster, captures, timeFor]
  );

  const placed = useMemo(() => orderCaptures(captures), [captures]);
  const stillUnnamed = unnamedCount(captures);
  const assigningPlace = assigningId ? placed.find((c) => c.id === assigningId)?.place ?? null : null;

  const raceName = raceResults?.race.name ?? 'Race';
  const recordedCount = entrants.filter((e) => timeFor(e.athleteId) != null).length;

  return (
    <div className="min-h-screen bg-background">
      <FieldHeader
        title={entrants.length > 0 ? `${raceName} (${entrants.length})` : raceName}
        subtitle={entrants.length > 0 ? `${recordedCount} of ${entrants.length} recorded` : undefined}
        actions={[{ icon: X, label: 'Close', onClick: () => navigate(-1), variant: 'ghost' }]}
      />

      <div className="mx-auto max-w-lg space-y-5 p-4">
        {!entrantsLoading && entrants.length === 0 && captures.length === 0 ? (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>No entrants yet</CardTitle>
              <CardDescription>
                Add who's running — you can still time first and name people afterwards, but a
                declared list makes the naming pass much faster.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <Button onClick={() => setEntrantsDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add entrants
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/40 py-6">
              <span className="font-mono text-6xl font-bold tabular-nums tracking-tight text-primary">
                {formatElapsed(elapsedMs)}
              </span>
              <div className="flex gap-2">
                {phase === 'running' ? (
                  <Button size="lg" variant="outline" className="h-12 px-8" onClick={handleStop}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                ) : (
                  <Button size="lg" className="h-12 px-8" onClick={handleStart}>
                    <Play className="mr-2 h-5 w-5" />
                    {elapsedMs > 0 ? 'Resume' : 'Start'}
                  </Button>
                )}
                {phase !== 'running' && elapsedMs > 0 && (
                  <Button size="lg" variant="ghost" className="h-12" onClick={handleReset}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* The primary action. Deliberately the biggest target on the
                page: one press per runner crossing, no name needed, no
                scanning. Everything else here exists to support it. */}
            <button
              type="button"
              onClick={handleFinish}
              disabled={phase !== 'running'}
              className="flex h-28 w-full flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            >
              <Flag className="mb-1 h-7 w-7" />
              <span className="text-2xl font-bold">Finish</span>
              <span className="text-xs opacity-90">
                {phase === 'running' ? 'Tap as each runner crosses' : 'Start the clock first'}
              </span>
            </button>

            {placed.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Finish order ({placed.length})
                  </p>
                  {stillUnnamed > 0 && (
                    <span className="text-xs text-muted-foreground">{stillUnnamed} to name</span>
                  )}
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {placed.map((capture) => {
                    const isAssigning = capture.id === assigningId;
                    const name = capture.athleteId ? nameById.get(capture.athleteId) ?? 'Unknown' : null;
                    return (
                      <div
                        key={capture.id}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                          isAssigning ? 'border-primary bg-primary/5' : 'bg-background'
                        }`}
                      >
                        <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                          {capture.place}
                        </span>
                        <span className="w-14 shrink-0 font-mono font-medium tabular-nums">
                          {formatTime(capture.timeSec)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedCaptureId(capture.id)}
                          className="min-w-0 flex-1 truncate text-left"
                        >
                          {name ?? (
                            <span className={isAssigning ? 'font-medium text-primary' : 'text-muted-foreground'}>
                              {isAssigning ? 'Tap a name below →' : 'Unnamed — tap to name'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCapture(capture.id)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Delete finish ${capture.place}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The one ambiguous interaction on this page — say which mode
                the grid is in rather than leaving it to be inferred. */}
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {assigningId ? (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Naming <span className="font-medium">#{assigningPlace}</span> ·{' '}
                    <span className="font-mono">{formatTime(placed.find((c) => c.id === assigningId)?.timeSec ?? null)}</span>
                    {' '}— tap who it was.
                  </span>
                  {selectedCaptureId && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCaptureId(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              ) : phase === 'running' ? (
                <span>Tapping a name records their finish now. Tap again to clear.</span>
              ) : (
                <span>Start the clock, or tap an unnamed row above to name it.</span>
              )}
            </div>

            {entrants.length > 1 && (
              <SegmentedPills
                caption="Sort"
                segments={[
                  { value: 'fastest', label: 'Fastest' },
                  { value: 'first', label: 'First name' },
                  { value: 'last', label: 'Last name' },
                ]}
                value={sortMode}
                onChange={(v) => setSortMode(v as 'fastest' | 'first' | 'last')}
              />
            )}

            {/* md, not the arbitrary min-[700px] this started as: Tailwind
                only guarantees correct cascade order between its own named
                breakpoints. An arbitrary breakpoint's media block can land
                earlier in the compiled CSS than sm's — which is exactly
                what happened here, so sm:grid-cols-3 (later in the
                stylesheet, same specificity) kept winning the tie at any
                width past 700px, including a full-size iPad. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {gridEntrants.map((entrant) => {
                const recorded = timeFor(entrant.athleteId);
                const pending = entrant.athleteId in pendingByAthlete;
                const tappable = assigningId ? true : recorded != null || phase === 'running';
                return (
                  <button
                    key={entrant.athleteId}
                    type="button"
                    onClick={() => {
                      if (assigningId) handleAssign(assigningId, entrant.athleteId);
                      else if (recorded != null) handleClearAthlete(entrant.athleteId);
                      else handleRecordNow(entrant.athleteId);
                    }}
                    disabled={!tappable}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center font-medium transition-colors ${
                      recorded != null
                        ? pending
                          ? 'border-muted-foreground/40 bg-muted text-muted-foreground'
                          : 'border-primary bg-primary text-primary-foreground'
                        : 'border-foreground bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none'
                    }`}
                  >
                    <span className="text-sm">{entrant.name}</span>
                    {recorded != null && (
                      <span className="mt-0.5 font-mono text-xs opacity-90">
                        {formatTime(recorded)} · {pending ? 'saving…' : 'tap to clear'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {assigningId && gridEntrants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every entrant has a time. Use the search below if this was someone else.
              </p>
            )}

            {/* Someone who was never declared — search the whole roster
                rather than adding them as an entrant first. */}
            {assigningId && (
              <div>
                <p className="mb-2 text-sm font-medium">Not an entrant?</p>
                <AthletePicker
                  athletes={assignableRoster}
                  onPick={(athleteId) => handleAssign(assigningId, athleteId)}
                  placeholder="Search the whole roster…"
                  emptyLabel="Everyone on the roster already has a time."
                />
              </div>
            )}

            <div className="pt-2">
              <p className="mb-2 text-sm font-medium">Someone not on this list ran too</p>
              <AthletePicker
                athletes={availableToAdd}
                onPick={handleAddEntrant}
                disabled={addEntrant.isPending}
                emptyLabel="Everyone on the roster is already entered."
              />
            </div>

            <Button variant="ghost" size="sm" onClick={() => setEntrantsDialogOpen(true)}>
              Manage entrants
            </Button>
          </>
        )}
      </div>

      <ManageEntrantsDialog
        raceId={raceId ?? ''}
        raceName={raceName}
        seasonYear={seasonYear}
        raceDistanceMeters={raceResults?.race.distanceMeters ?? null}
        open={entrantsDialogOpen}
        onOpenChange={setEntrantsDialogOpen}
      />
    </div>
  );
};

export default RaceLiveTimerPage;
