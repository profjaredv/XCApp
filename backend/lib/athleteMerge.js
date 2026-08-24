// Merging two Athlete rows into one — the "odd event" recovery path for
// when reconciliation (lib/athleteMatching.js) still lets a duplicate
// through. There's no unique constraint on (teamId, name) — see the
// Athlete model's schema comment — so nothing in the database itself
// prevents two rows for the same real person, and nothing in the
// database prevents it from happening again. This module is the pure,
// testable half: given the keeper's and loser's existing rows in some
// table, decide which of the loser's rows can just be re-pointed to the
// keeper and which collide with something the keeper already has.
//
// Every table with an athleteId foreign key uses onDelete: Cascade (see
// the Athlete model's relation list) — that's the actual stakes here. It
// is NOT a safety net: if a table's loser-side rows aren't explicitly
// re-pointed (or deliberately dropped) before the loser Athlete row is
// deleted, Cascade destroys them silently, not blocked by a constraint.
// routes/athletes.js's merge endpoint is the DB-touching half that walks
// every such table using the plan this produces.

// keeperRows/loserRows: arrays of rows (already fetched, whatever shape).
// keyFn: extracts the value that must be unique per athlete within this
// table (e.g. a raceId for Result, a seasonId for SeasonRoster) — this is
// NOT the row's own id, it's the other half of the table's unique
// constraint alongside athleteId.
//
// Returns { repoint, drop }: `repoint` rows have no keeper row sharing
// that key, so re-pointing athleteId to the keeper is safe; `drop` rows
// collide with a keeper row that already exists for that same key — the
// keeper's row wins and the loser's is left to whoever calls this to
// delete (never silently kept as an orphan, and never overwriting the
// keeper's row with the loser's).
function planDedup(keeperRows, loserRows, keyFn) {
  const keeperKeys = new Set(keeperRows.map(keyFn));
  const repoint = [];
  const drop = [];
  for (const row of loserRows) {
    if (keeperKeys.has(keyFn(row))) {
      drop.push(row);
    } else {
      repoint.push(row);
    }
  }
  return { repoint, drop };
}

module.exports = { planDedup };
