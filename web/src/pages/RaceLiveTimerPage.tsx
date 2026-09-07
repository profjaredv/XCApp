import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Play, RotateCcw, UserPlus, X } from 'lucide-react';
import { useRaceResults, useSubmitRaceResults, useRaceEntrants, useAddEntrant } from '@/hooks/useMeetOps';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { ManageEntrantsDialog } from '@/components/meets/ManageEntrantsDialog';
import { FieldHeader } from '@/components/field/FieldHeader';
import { rosterService } from '@/api/rosterService';
import { useQuery } from '@tanstack/react-query';

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

  const { data: roster = [] } = useQuery({
    queryKey: ['roster', seasonYear],
    queryFn: () => rosterService.getRoster(seasonYear ?? undefined),
    enabled: seasonYear != null,
  });

  const [phase, setPhase] = useState<'idle' | 'running'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [entrantsDialogOpen, setEntrantsDialogOpen] = useState(false);

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

            <p className="text-sm text-muted-foreground">
              {phase === 'running'
                ? 'Tap a name the moment they finish. Tap it again to clear a mistake.'
                : 'Start the clock, then tap each name as they finish.'}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {entrants.map((entrant) => {
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
        open={entrantsDialogOpen}
        onOpenChange={setEntrantsDialogOpen}
      />
    </div>
  );
};

export default RaceLiveTimerPage;
