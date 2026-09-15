// Capture-first timing: record the TIME now, sort out WHO afterwards.
//
// The live timer started out name-first — a grid of runners, tap the one
// who just crossed. That works for a handful and falls apart on a real
// heat: at a finish chute you cannot scan sixty names fast enough, and a
// missed tap is a lost time you can never recover. The order runners
// cross in is only observable once.
//
// So the button that matters takes no name at all. Every press appends a
// capture at the current elapsed time, as fast as a coach can tap, and the
// list that builds up IS the finish order. Naming is a separate, unhurried
// pass afterwards, where the remaining athletes are right there to tap
// through in order.
//
// A name tapped DURING the race isn't a different mechanism — it's the
// same capture with its athleteId already filled in. One list, one
// ordering, whether identity arrived at the finish line or ten minutes
// later.

export interface Capture {
  id: string;
  timeSec: number;
  /** Null until someone says who this was. */
  athleteId: string | null;
}

export interface PlacedCapture extends Capture {
  /** 1-based finish position, counting named and unnamed alike — the
   *  whole point is that an unnamed runner still took a place. */
  place: number;
}

let captureCounter = 0;
/** Unique within a session; never persisted as meaning anything. */
export function newCaptureId(): string {
  captureCounter += 1;
  return `c${Date.now().toString(36)}${captureCounter.toString(36)}`;
}

/**
 * Finish order: by elapsed time, ties broken by the order they were
 * pressed. Never by name or by which ones have been identified — the
 * ordering has to stay put while a coach is naming rows, or the row
 * they're looking at moves under their thumb.
 */
export function orderCaptures(captures: Capture[]): PlacedCapture[] {
  return captures
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.timeSec - b.c.timeSec || a.i - b.i)
    .map(({ c }, index) => ({ ...c, place: index + 1 }));
}

/** The row the naming pass should be sitting on: earliest unnamed. */
export function nextUnnamedId(captures: Capture[]): string | null {
  return orderCaptures(captures).find((c) => c.athleteId == null)?.id ?? null;
}

export function unnamedCount(captures: Capture[]): number {
  return captures.reduce((n, c) => n + (c.athleteId == null ? 1 : 0), 0);
}

/**
 * Name a capture. An athlete already sitting on another capture MOVES
 * here rather than being duplicated — two rows claiming one runner would
 * write two results for them and silently drop whoever the other row
 * really was. Correcting a mis-tap is the common case, so it's the
 * behaviour that needs no extra step.
 */
export function assignCapture(captures: Capture[], captureId: string, athleteId: string): Capture[] {
  return captures.map((c) => {
    if (c.id === captureId) return { ...c, athleteId };
    if (c.athleteId === athleteId) return { ...c, athleteId: null };
    return c;
  });
}

export function unassignCapture(captures: Capture[], captureId: string): Capture[] {
  return captures.map((c) => (c.id === captureId ? { ...c, athleteId: null } : c));
}

export function removeCapture(captures: Capture[], captureId: string): Capture[] {
  return captures.filter((c) => c.id !== captureId);
}

/**
 * Who is still tappable in the naming pass: everyone who hasn't been
 * named to a capture yet, minus anyone who already has a saved time from
 * somewhere else (a previous session, a manual entry). Order is the
 * caller's — this only filters, so a fastest-first or alphabetical grid
 * stays in whatever order it was handed in.
 */
export function remainingBy<T>(
  candidates: T[],
  captures: Capture[],
  alreadyTimedIds: ReadonlySet<string>,
  idOf: (item: T) => string
): T[] {
  const claimed = new Set(captures.map((c) => c.athleteId).filter((id): id is string => id != null));
  return candidates.filter((a) => {
    const id = idOf(a);
    return !claimed.has(id) && !alreadyTimedIds.has(id);
  });
}

/** The `{ id }` case. Entrant rows key on athleteId instead — those go
 *  through remainingBy with an explicit accessor rather than a cast. */
export function remainingAthletes<T extends { id: string }>(
  candidates: T[],
  captures: Capture[],
  alreadyTimedIds: ReadonlySet<string> = new Set()
): T[] {
  return remainingBy(candidates, captures, alreadyTimedIds, (a) => a.id);
}

/** Captures ready to be written as real results — named ones only. */
export function namedCaptures(captures: Capture[]): Array<{ athleteId: string; time: number }> {
  return orderCaptures(captures)
    .filter((c): c is PlacedCapture & { athleteId: string } => c.athleteId != null)
    .map((c) => ({ athleteId: c.athleteId, time: c.timeSec }));
}
