// T4 (Team Management handoff): pure helpers for meet entry management —
// kept DB-free so the season-best/cap-warning logic is directly testable
// (rule 5: write the test before the fix for anything arithmetic-related),
// not only exercised indirectly through routes/meetOps.js.

function seasonBestSec(results) {
  const times = results.map((r) => r.time).filter((t) => typeof t === 'number' && t > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

// "Add a per-race entry cap with a warning when exceeded, since most meets
// limit varsity to seven." No per-race cap field exists in MeetEntry/Race
// (T4's spec doesn't define one), so this is a single warning threshold
// applied uniformly — a UI nudge on the entry screen, never a hard block,
// since JV/lower-level races commonly run larger fields than varsity.
const DEFAULT_ENTRY_CAP = 7;

function decideEntryCapWarning(enteredCount, cap = DEFAULT_ENTRY_CAP) {
  return enteredCount > cap;
}

const VALID_ENTRY_STATUSES = ['ENTERED', 'ALTERNATE', 'NOT_ENTERED', 'SCRATCHED', 'INJURED', 'ACADEMIC', 'EXCUSED'];

module.exports = { seasonBestSec, decideEntryCapWarning, DEFAULT_ENTRY_CAP, VALID_ENTRY_STATUSES };
