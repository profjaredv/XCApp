import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Play, Pause, X, ChevronRight, Loader2, Timer as TimerIcon } from 'lucide-react';
import { useRaceResults, useSubmitRaceResults, useTimerSessions, useDeleteTimerSession } from '@/hooks/useMeetOps';
import { useAthleteRecentRace } from '@/hooks/useAthleteRecentRace';
import { rosterService, type RosterAthlete } from '@/api/rosterService';
import { meetOpsService, type RaceResultEntry, type TimerSessionDraft } from '@/api/meetOpsService';

// Live finish-order capture for a race — built for a track time trial run
// live off a phone, but works for any race a coach is timing by hand.
// Deliberately two-phase: capture the ORDER during the run (tap Capture as
// each runner crosses, no need to know who yet — that's the whole point,
// watching the clock while identifying 20 runners at once doesn't work),
// then assign athletes to that order afterward at a calmer pace. Saves
// through the same POST /races/:raceId/results batch endpoint
// EnterRaceResultsDialog uses — a live-timed result and a hand-typed one
// are stored identically.
//
// Every capture/assign/clear/remove action is auto-saved server-side as a
// TimerSession draft (best-effort, silent) so a coach who gets pulled
// away before finishing the athlete-assignment step doesn't lose the
// captured times to a closed tab, a dead battery, or a crash — landing
// back on this page offers to resume it. A running clock is never itself
// resumable (there's no meaningful way to "continue" it after real time
// has passed unobserved), so a resumed draft always opens straight into
// the review/assign screen with whatever was captured.

type Phase = 'idle' | 'running' | 'paused' | 'review';

function formatElapsed(ms: number): string {
  const totalCenti = Math.max(0, Math.floor(ms / 10));
  const mins = Math.floor(totalCenti / 6000);
  const secs = Math.floor((totalCenti % 6000) / 100);
  const centi = totalCenti % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centi).padStart(2, '0')}`;
}

// Custom, not a form control — no shadcn slider is a drag-to-confirm
// gesture. Threshold well short of the far edge (dragging most of the way
// is a deliberate act; requiring literally 100% just makes people fight
// the last pixel) but far enough that a stray tap or short drag can't
// trigger it — the whole reason this is a slide instead of a button is to
// make "end the session" require an actual deliberate motion, not a tap
// that fires from a mis-touch mid-race.
const SlideToConfirm: React.FC<{ label: string; onConfirm: () => void }> = ({ label, onConfirm }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const THUMB = 48;

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const maxX = rect.width - THUMB;
    const x = Math.min(Math.max(e.clientX - rect.left - THUMB / 2, 0), maxX);
    setDragX(x);
    if (maxX > 0 && x >= maxX * 0.9) {
      draggingRef.current = false;
      setDragging(false);
      setDragX(maxX);
      onConfirm();
    }
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragX(0);
  };

  return (
    <div ref={trackRef} className="relative h-14 rounded-full bg-muted select-none touch-none overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-muted-foreground pointer-events-none">
        {label}
      </div>
      <div
        className={`absolute top-1 left-1 h-12 w-12 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground shadow-md ${dragging ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <ChevronRight className="h-5 w-5" />
      </div>
    </div>
  );
};

const RaceLiveTimerPage: React.FC = () => {
  const navigate = useNavigate();
  const { raceId } = useParams<{ raceId: string }>();
  const { data: raceResults } = useRaceResults(raceId ?? null);
  const seasonYear = raceResults?.race.season ?? null;
  const submitResults = useSubmitRaceResults(raceId ?? null);
  const { data: timerSessions = [] } = useTimerSessions(raceId ?? null);
  const deleteTimerSession = useDeleteTimerSession(raceId ?? null);

  const { data: roster = [] } = useQuery({
    queryKey: ['roster', seasonYear],
    queryFn: () => rosterService.getRoster(seasonYear ?? undefined),
    enabled: seasonYear != null,
  });
  const athleteIds = useMemo(() => roster.map((a) => a.id), [roster]);
  const { data: recentRaceByAthlete } = useAthleteRecentRace(athleteIds);

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [captures, setCaptures] = useState<number[]>([]); // elapsed seconds, in order
  const [assignments, setAssignments] = useState<Record<number, string>>({}); // capture index -> athleteId

  const startRef = useRef(0);
  const accumulatedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The server id of this session's TimerSession draft, once one exists —
  // null until the first capture (or a resumed session) creates it.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const tick = () => setElapsedMs(accumulatedRef.current + (performance.now() - startRef.current));

  // Best-effort, silent — a failed autosave shouldn't interrupt a coach
  // mid-race with an error dialog. The real backstop against total data
  // loss is that every capture/assign action retries this independently;
  // one dropped save just means a slightly stale draft, not a lost one.
  const syncDraft = async (nextCaptures: number[], nextAssignments: Record<number, string>) => {
    if (!raceId) return;
    const assignmentsPayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(nextAssignments)) assignmentsPayload[k] = v;
    try {
      if (!sessionIdRef.current) {
        const created = await meetOpsService.createTimerSession(raceId, { captures: nextCaptures, assignments: assignmentsPayload });
        sessionIdRef.current = created.id;
      } else {
        await meetOpsService.updateTimerSession(sessionIdRef.current, { captures: nextCaptures, assignments: assignmentsPayload });
      }
    } catch (err) {
      console.error('Could not save timer draft:', err);
    }
  };

  const handleStart = () => {
    sessionIdRef.current = null;
    startRef.current = performance.now();
    accumulatedRef.current = 0;
    setElapsedMs(0);
    setCaptures([]);
    setAssignments({});
    setPhase('running');
    intervalRef.current = setInterval(tick, 50);
  };

  const handlePause = () => {
    accumulatedRef.current = elapsedMs;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('paused');
  };

  const handleResume = () => {
    startRef.current = performance.now();
    setPhase('running');
    intervalRef.current = setInterval(tick, 50);
  };

  const handleCapture = () => {
    const next = [...captures, elapsedMs / 1000];
    setCaptures(next);
    syncDraft(next, assignments);
  };

  const handleEndSession = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('review');
  };

  // Loads a previously-captured draft straight into the review/assign
  // screen — see the file header comment for why a resumed session never
  // re-enters a "still running" state.
  const handleResumeDraft = (session: TimerSessionDraft) => {
    sessionIdRef.current = session.id;
    const restoredAssignments: Record<number, string> = {};
    for (const [k, v] of Object.entries(session.assignments)) restoredAssignments[Number(k)] = v;
    setCaptures(session.captures);
    setAssignments(restoredAssignments);
    setElapsedMs(session.captures.length > 0 ? session.captures[session.captures.length - 1] * 1000 : 0);
    setPhase('review');
  };

  const handleDiscardDraft = async (sessionId: string) => {
    if (!window.confirm('Discard this unfinished session? The captured times will be lost.')) return;
    try {
      await deleteTimerSession.mutateAsync(sessionId);
    } catch {
      toast.error('Could not discard that session.');
    }
  };

  // Explicit abandon — distinct from just closing the page (below), which
  // never loses anything now that every action auto-saves: this is the
  // one action that actually deletes the draft.
  const handleDiscard = async () => {
    if (!window.confirm('Discard this session? The captured times will be deleted.')) return;
    if (sessionIdRef.current) {
      try {
        await meetOpsService.deleteTimerSession(sessionIdRef.current);
      } catch {
        // Best-effort — an orphaned draft is a minor cleanup issue, not
        // worth blocking the coach's exit over.
      }
    }
    navigate(-1);
  };

  // Fastest-recent-pace-first — the runners most likely to be captured
  // first (#1, #2, ...) surface at the top of the tap list, so the coach
  // isn't hunting through the whole roster for the kids who just crossed
  // the line first. Athletes with no recent race sort after everyone with
  // one, alphabetically among themselves.
  const sortedRoster = useMemo(() => {
    const paceOf = (a: RosterAthlete) => {
      const r = recentRaceByAthlete?.get(a.id);
      return r && r.distance > 0 ? r.time / r.distance : null;
    };
    return [...roster].sort((a, b) => {
      const pa = paceOf(a);
      const pb = paceOf(b);
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [roster, recentRaceByAthlete]);

  const assignedAthleteIds = useMemo(() => new Set(Object.values(assignments)), [assignments]);
  const unassignedRoster = useMemo(
    () => sortedRoster.filter((a) => !assignedAthleteIds.has(a.id)),
    [sortedRoster, assignedAthleteIds]
  );

  const assignNext = (athleteId: string) => {
    const nextIdx = captures.findIndex((_, idx) => assignments[idx] === undefined);
    if (nextIdx === -1) return;
    const next = { ...assignments, [nextIdx]: athleteId };
    setAssignments(next);
    syncDraft(captures, next);
  };

  const clearAssignment = (idx: number) => {
    const next = { ...assignments };
    delete next[idx];
    setAssignments(next);
    syncDraft(captures, next);
  };

  const removeCapture = (idx: number) => {
    const nextCaptures = captures.filter((_, i) => i !== idx);
    const nextAssignments: Record<number, string> = {};
    for (const [k, v] of Object.entries(assignments)) {
      const i = Number(k);
      if (i === idx) continue;
      nextAssignments[i > idx ? i - 1 : i] = v;
    }
    setCaptures(nextCaptures);
    setAssignments(nextAssignments);
    syncDraft(nextCaptures, nextAssignments);
  };

  const assignedCount = Object.keys(assignments).length;

  const handleSaveResults = async () => {
    const entries: RaceResultEntry[] = Object.entries(assignments).map(([idxStr, athleteId]) => ({
      athleteId,
      time: captures[Number(idxStr)],
    }));
    try {
      await submitResults.mutateAsync(entries);
      if (sessionIdRef.current) {
        try {
          await meetOpsService.deleteTimerSession(sessionIdRef.current);
        } catch {
          // Best-effort — the results are already saved; a leftover draft
          // row is a minor cleanup issue, not worth surfacing to the coach.
        }
      }
      toast.success(`Saved ${entries.length} result${entries.length === 1 ? '' : 's'}.`);
      navigate(-1);
    } catch {
      toast.error('Could not save results.');
    }
  };

  const raceName = raceResults?.race.name ?? 'Race';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2 min-w-0">
          <TimerIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{raceName}</span>
        </div>
        {/* Every capture/assign action is already auto-saved as a draft,
            so closing never loses anything — it just leaves an
            "Unfinished session" to resume next time. Discard (below, review
            screen only) is the one action that actually deletes it. */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </div>

      <div className="flex-1 p-4 max-w-lg w-full mx-auto space-y-6">
        {phase !== 'review' && (
          <>
            <div className="rounded-2xl border bg-muted/40 py-10 flex items-center justify-center">
              <span className="text-6xl font-mono font-bold tabular-nums tracking-tight text-primary">
                {formatElapsed(elapsedMs)}
              </span>
            </div>

            {phase === 'idle' && (
              <>
                {timerSessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Unfinished session{timerSessions.length === 1 ? '' : 's'}</p>
                    {timerSessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                        <div className="text-sm min-w-0">
                          <p>
                            {s.captures.length} time{s.captures.length === 1 ? '' : 's'} captured ·{' '}
                            {Object.keys(s.assignments).length} assigned
                          </p>
                          <p className="text-xs text-muted-foreground">Updated {new Date(s.updatedAt).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleDiscardDraft(s.id)} disabled={deleteTimerSession.isPending}>
                            Discard
                          </Button>
                          <Button size="sm" onClick={() => handleResumeDraft(s)}>
                            Resume
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="lg" className="w-full h-14 text-base" onClick={handleStart}>
                  <Play className="h-5 w-5 mr-2" />
                  Start {timerSessions.length > 0 ? 'New ' : ''}Timer
                </Button>
              </>
            )}

            {(phase === 'running' || phase === 'paused') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {phase === 'running' ? (
                    <Button size="lg" className="h-14 text-base" onClick={handlePause}>
                      <Pause className="h-5 w-5 mr-2" />
                      Pause
                    </Button>
                  ) : (
                    <Button size="lg" className="h-14 text-base" onClick={handleResume}>
                      <Play className="h-5 w-5 mr-2" />
                      Resume
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 text-base"
                    onClick={handleCapture}
                    disabled={phase !== 'running'}
                  >
                    Capture
                  </Button>
                </div>

                <SlideToConfirm label="Slide to end session" onConfirm={handleEndSession} />

                {captures.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Recent times ({captures.length} captured)
                    </p>
                    {[...captures]
                      .map((sec, idx) => ({ sec, position: idx + 1 }))
                      .reverse()
                      .slice(0, 4)
                      .map(({ sec, position }) => (
                        <div key={position} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                          <span className="text-muted-foreground">#{position}</span>
                          <span className="font-mono">{formatElapsed(sec * 1000)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {phase === 'review' && (
          <>
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Duration</p>
              <p className="text-3xl font-mono font-bold text-primary">{formatElapsed(elapsedMs)}</p>
              <p className="text-sm text-muted-foreground">
                {captures.length} time{captures.length === 1 ? '' : 's'} captured · {assignedCount} assigned
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Tap an athlete to assign them to the next open finish spot.</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                {unassignedRoster.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Everyone on the roster is assigned.</p>
                ) : (
                  unassignedRoster.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => assignNext(a.id)}
                      disabled={assignedCount >= captures.length}
                      className="px-3 py-2 rounded-full border text-sm bg-background hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {a.preferredName || a.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1">
              {captures.map((sec, idx) => {
                const athleteId = assignments[idx];
                const athlete = roster.find((a) => a.id === athleteId);
                return (
                  <div key={idx} className="flex items-center gap-2 py-2 border-b last:border-0">
                    <span className="text-sm text-muted-foreground w-8 shrink-0">#{idx + 1}</span>
                    <span className="font-mono text-sm w-20 shrink-0">{formatElapsed(sec * 1000)}</span>
                    <span className="flex-1 text-sm truncate">
                      {athlete ? (athlete.preferredName || athlete.name) : <span className="text-muted-foreground italic">Unassigned</span>}
                    </span>
                    {athlete && (
                      <Button variant="ghost" size="sm" onClick={() => clearAssignment(idx)}>
                        Clear
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeCapture(idx)} title="Remove this capture">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pb-6">
              <Button variant="outline" className="flex-1" onClick={handleDiscard}>
                Discard
              </Button>
              <Button className="flex-1" onClick={handleSaveResults} disabled={assignedCount === 0 || submitResults.isPending}>
                {submitResults.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save {assignedCount} Result{assignedCount === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RaceLiveTimerPage;
