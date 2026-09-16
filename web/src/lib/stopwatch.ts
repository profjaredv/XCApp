// Wall-clock stopwatch math.
//
// These timers used to anchor to performance.now(). It is the obvious
// choice — monotonic, immune to the system clock being adjusted — and it
// is wrong for a stopwatch a coach carries in a pocket.
//
// On Android, the clock behind performance.now() does not count time the
// device spends in deep sleep. Screen off during a 2000m rep and the page
// simply loses those minutes: a coach compared this timer against a Garmin
// started at the same moment and found it 3:15 behind after 15 minutes.
// Re-anchoring per tick doesn't help, because the anchor and the reading
// come from the same stalled clock.
//
// Date.now() always advances, because it is the wall clock. Its own risk —
// an NTP correction stepping it backwards mid-rep — is smaller and is
// handled below, and unlike a stalled clock it cannot quietly swallow
// minutes of a workout.

/**
 * The instant elapsed=0 maps to. Subtracting existing elapsed is what
 * makes resume continue rather than restart.
 */
export function anchorFor(elapsedMs: number, now: number = Date.now()): number {
  return now - Math.max(0, elapsedMs);
}

/**
 * Elapsed time for a tick. Never negative and never rewinds: if the system
 * clock steps backwards (an NTP correction), the reading holds at the last
 * value instead of counting down, which on a running stopwatch would look
 * like the app losing its mind mid-rep.
 */
export function elapsedSince(anchor: number, previousMs = 0, now: number = Date.now()): number {
  return Math.max(previousMs, now - anchor);
}
