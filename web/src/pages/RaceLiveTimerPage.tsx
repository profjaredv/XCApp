import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Play, RotateCcw, UserPlus, UserX, X } from 'lucide-react';
import { useRaceResults, useSubmitRaceResults, useRaceEntrants, useAddEntrant } from '@/hooks/useMeetOps';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { ManageEntrantsDialog } from '@/components/meets/ManageEntrantsDialog';
import { FieldHeader } from '@/components/field/FieldHeader';
import { SegmentedPills } from '@/components/field/SegmentedPills';
import { fastestFirstPaceSecPerMile } from '@/api/groupService';
import { firstNameOf, lastNameOf } from '@/lib/athleteSearch';

// The Live Timer, rewritten to match Interval Sessions' Timer mode: start
// one stopwatch, tap a name the moment they finish, done — see
// IntervalSessionManagePage.tsx's IntervalTimerPanel, the model this
// copies. That was possible for intervals because who's doing the session
// is always known ahead of time; this page needed race entrants (backend
// MeetEntry, reused — see routes/meetOps.js) to exist first, so a tap has
// a bounded, named list to land on instead of the entire team roster.
//
// The old flow — tap "Capture" repeatedly with no identity yet, then
// assign athletes to captures afterward — existed because identity
// genuinely wasn't known up front. It's gone along with the TimerSession
// draft table that backed it: every tap here writes a real Result
// directly (the same batch endpoint EnterRaceResultsDialog uses), so
// there's nothing left to draft or resume. Closing this page mid-race
// loses nothing — every tap already saved.
//
// "Runner not listed" (below) is the one deliberate exception: a runner
// who's in the race but isn't an entrant and can't be found/identified in
// the moment a coach needs to log their time. Reclickable with no name
// attached — logs the elapsed time now, name TBD — because the whole
// point is not losing the time while someone figures out who that was.
// Unlike a normal tap, this genuinely has nowhere durable to write yet
// (Result.athleteId is required — see schema.prisma), so it's held in
// local state, backed by localStorage per race so a reload doesn't lose
// it, until assigned to a real athlete (at which point it becomes a
// normal Result, same save() path as everything else on this page).

const UNASSIGNED_STORAGE_KEY = (raceId: string) => `xc_unassigned_captures_${raceId}`;

interface UnassignedCapture {
  id: string;
  timeSec: number;
  /** Set while this capture's assign save is in flight — the row stays
   * visible with the picked name until it's confirmed, same "saving…"
   * convention as everywhere else on this page. */
  assignedTo?: { athleteId: string; name: string };
}

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

  const [phase, setPhase] = useState<'idle' | 'running'>('idle');
  const [sortMode, setSortMode] = useState<'fastest' | 'first' | 'last'>('fastest');
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [entrantsDialogOpen, setEntrantsDialogOpen] = useState(false);

  // "Runner not listed" — see the file header comment. Restored from
  // localStorage on mount (per race) so a reload mid-race doesn't drop an
  // unnamed time nobody's assigned yet; an in-flight "assignedTo" from a
  // previous session is deliberately not restored — a stuck "saving…"
  // across a reload should just revert to "pick a name," not stay stuck.
  const [unassignedCaptures, setUnassignedCaptures] = useState<UnassignedCapture[]>(() => {
    if (!raceId) return [];
    try {
      const raw = window.localStorage.getItem(UNASSIGNED_STORAGE_KEY(raceId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map((c: { id: string; timeSec: number }) => ({ id: c.id, timeSec: c.timeSec }))
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!raceId) return;
    try {
      const toStore = unassignedCaptures.map(({ id, timeSec }) => ({ id, timeSec }));
      window.localStorage.setItem(UNASSIGNED_STORAGE_KEY(raceId), JSON.stringify(toStore));
    } catch {
      // Private browsing, or storage blocked — the capture still lives in
      // this tab's state either way, just won't survive a reload.
    }
  }, [raceId, unassignedCaptures]);

  // Same optimistic-paint fix as Interval Sessions' Timer mode: a tap
  // saves through a real network round trip (invalidate + refetch), and
  // waiting on that before painting anything reads as "did that tap even
  // work." athleteId -> the value now showing on screen, reconciled
  // (cleared) once the save settles either way.
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

  const handleStart = () => {
    startRef.current = performance.now();
    setElapsedMs(0);
    setPhase('running');
    intervalRef.current = setInterval(() => setElapsedMs(performance.now() - startRef.current), 100);
  };

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

  const save = (athleteId: string, time: number | null) => {
    setPendingByAthlete((prev) => ({ ...prev, [athleteId]: time }));
    submitResults.mutate([{ athleteId, time }], {
      onSuccess: () => clearPending(athleteId),
      onError: () => {
        clearPending(athleteId);
        toast.error(time == null ? 'Could not clear that time — try again.' : 'Could not save that time — try again.');
      },
    });
  };

  const handleRecord = (athleteId: string) => save(athleteId, Math.round(elapsedMs / 1000));
  const handleClear = (athleteId: string) => save(athleteId, null);

  // Reclickable on purpose — no per-press disabled state, no capture ever
  // "consumes" the button. One press per runner who crosses and can't be
  // identified in the moment; each becomes its own row to name afterward.
  const handleLogUnnamed = () => {
    if (phase !== 'running') return;
    setUnassignedCaptures((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timeSec: Math.round(elapsedMs / 1000) },
    ]);
  };

  const handleDiscardUnnamed = (captureId: string) => {
    setUnassignedCaptures((prev) => prev.filter((c) => c.id !== captureId));
  };

  // Same optimistic pattern as save() above, plus bookkeeping to remove
  // the row once it's genuinely become a real Result — not reusing save()
  // directly since nothing else on this page needs to react to "this
  // specific capture is now spoken for" the way this does.
  const handleAssignUnnamed = (captureId: string, athleteId: string, athleteName: string) => {
    const capture = unassignedCaptures.find((c) => c.id === captureId);
    if (!capture) return;
    setUnassignedCaptures((prev) =>
      prev.map((c) => (c.id === captureId ? { ...c, assignedTo: { athleteId, name: athleteName } } : c))
    );
    setPendingByAthlete((prev) => ({ ...prev, [athleteId]: capture.timeSec }));
    submitResults.mutate([{ athleteId, time: capture.timeSec }], {
      onSuccess: () => {
        clearPending(athleteId);
        setUnassignedCaptures((prev) => prev.filter((c) => c.id !== captureId));
      },
      onError: () => {
        clearPending(athleteId);
        setUnassignedCaptures((prev) => prev.map((c) => (c.id === captureId ? { ...c, assignedTo: undefined } : c)));
        toast.error('Could not save that time — try again.');
      },
    });
  };

  // Fastest-first by default: on a 60-person heat, scanning for one name
  // is the whole bottleneck, and pace order puts the runners most likely
  // to finish (and need tapping) first at the top. Sorting only ever
  // reorders this array — recorded/pending state is keyed by athleteId
  // (timeFor, pendingByAthlete above), never by position, so switching
  // sort mode can't un-mark someone already tapped.
  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
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
      // 'fastest' — no pace on record sorts to the end, ties by name.
      if (a.pace == null && b.pace == null) return a.entrant.name.localeCompare(b.entrant.name);
      if (a.pace == null) return 1;
      if (b.pace == null) return -1;
      return a.pace - b.pace;
    });
    return withKeys.map((w) => w.entrant);
  }, [entrants, rosterById, sortMode]);

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

  // Who an unassigned capture can be named to — the whole roster, not
  // just entrants: "not listed OR can't find" covers both someone who was
  // never declared and an entrant the coach just couldn't spot in time.
  // Excludes anyone who already has a time, and anyone another unassigned
  // row is already mid-assigning to, so the same person can't end up
  // double-claimed.
  const claimedByOtherCaptures = useMemo(
    () => new Set(unassignedCaptures.filter((c) => c.assignedTo).map((c) => c.assignedTo!.athleteId)),
    [unassignedCaptures]
  );
  const assignableRoster = useMemo(
    () =>
      roster
        .filter((a) => timeFor(a.id) == null && !claimedByOtherCaptures.has(a.id))
        .map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [roster, timeFor, claimedByOtherCaptures]
  );

  const raceName = raceResults?.race.name ?? 'Race';
  const recordedCount = entrants.filter((e) => timeFor(e.athleteId) != null).length;

  return (
    <div className="min-h-screen bg-background">
      <FieldHeader
        title={raceName}
        subtitle={entrants.length > 0 ? `${recordedCount} of ${entrants.length} recorded` : undefined}
        actions={[{ icon: X, label: 'Close', onClick: () => navigate(-1), variant: 'ghost' }]}
      />

      <div className="mx-auto max-w-lg space-y-6 p-4">
        {!entrantsLoading && entrants.length === 0 ? (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>No entrants yet</CardTitle>
              <CardDescription>
                Add who's running this race first — the timer taps names from that list.
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
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/40 py-10">
              <span className="font-mono text-6xl font-bold tabular-nums tracking-tight text-primary">
                {formatElapsed(elapsedMs)}
              </span>
              {phase === 'idle' ? (
                <Button size="lg" className="h-14 px-10 text-base" onClick={handleStart}>
                  <Play className="mr-2 h-5 w-5" />
                  Start
                </Button>
              ) : (
                <Button size="lg" variant="outline" className="h-14 px-10 text-base" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Reset
                </Button>
              )}
            </div>

            {/* Reclickable, no name attached — for a runner who's in the
                race but isn't on the list below and can't be found fast
                enough to tap correctly. Logs the time now; who it was
                gets sorted out in "Unnamed times" below. */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleLogUnnamed}
              disabled={phase !== 'running'}
            >
              <UserX className="mr-2 h-4 w-4" />
              Runner not listed — log time only
            </Button>

            <p className="text-sm text-muted-foreground">
              {phase === 'running'
                ? 'Tap a name the moment they finish. Tap it again to clear a mistake.'
                : 'Start the clock, then tap each name as they finish.'}
            </p>

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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sortedEntrants.map((entrant) => {
                const recorded = timeFor(entrant.athleteId);
                const pending = entrant.athleteId in pendingByAthlete;
                const tappable = recorded != null || phase === 'running';
                return (
                  <button
                    key={entrant.athleteId}
                    type="button"
                    onClick={() => (recorded != null ? handleClear(entrant.athleteId) : handleRecord(entrant.athleteId))}
                    disabled={!tappable}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-colors ${
                      recorded != null
                        ? pending
                          ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
                          : 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:bg-accent disabled:opacity-40 disabled:pointer-events-none'
                    }`}
                  >
                    <span className="text-sm font-medium">{entrant.name}</span>
                    {recorded != null && (
                      <span className={`mt-0.5 font-mono text-xs ${pending ? 'text-muted-foreground' : 'text-primary'}`}>
                        {formatTime(recorded)} · {pending ? 'saving…' : 'tap to clear'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Times logged with "Runner not listed," waiting on a name.
                Each row is its own pick-a-name — assigning one writes a
                real Result the same way any other tap does. */}
            {unassignedCaptures.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">
                  Unnamed time{unassignedCaptures.length === 1 ? '' : 's'} ({unassignedCaptures.length})
                </p>
                {unassignedCaptures.map((capture) => (
                  <div key={capture.id} className="space-y-1.5 rounded-md border bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">{formatTime(capture.timeSec)}</span>
                      {capture.assignedTo ? (
                        <span className="text-xs text-muted-foreground">Saving {capture.assignedTo.name}…</span>
                      ) : (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => handleDiscardUnnamed(capture.id)}
                          aria-label="Discard this time"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {!capture.assignedTo && (
                      <AthletePicker
                        athletes={assignableRoster}
                        onPick={(athleteId) => {
                          const athlete = assignableRoster.find((a) => a.id === athleteId);
                          if (athlete) handleAssignUnnamed(capture.id, athleteId, athlete.name);
                        }}
                        placeholder="Whose time was this?"
                        emptyLabel="Everyone on the roster already has a time."
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Someone unexpected ran — a walk-on, an athlete who wasn't on
                the declared list. Adds them as an entrant immediately, so
                they show up above to tap like anyone else. */}
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
