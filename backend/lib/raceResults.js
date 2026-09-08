// Decides what one athlete's race-result save should actually write,
// without touching the database — pulled out of routes/meetOps.js's
// POST /races/:raceId/results so the "only touch what this entry
// actually mentions" decision (the part concurrent-edit safety depends
// on — two coaches saving different athletes, or even different fields
// for the same athlete, in the same "Enter Results" dialog around the
// same time) is directly testable, same pattern as
// lib/splitMath.js's planSplitBatchWrite.
//
// entry: { time?, status? } — time/status are OMITTED (not just
// undefined; callers should build these objects with the key genuinely
// absent) when this save isn't touching that field. Never resend a
// stale reconstructed value for a field the coach didn't edit — that's
// exactly what let one coach's save quietly revert another's.

const RESULT_STATUSES = ['FINISHED', 'DNF', 'DNS', 'DQ'];

function decideResultWrite(entry) {
  const hasTime = Object.prototype.hasOwnProperty.call(entry, 'time');
  const hasStatus = Object.prototype.hasOwnProperty.call(entry, 'status');
  if (!hasTime && !hasStatus) return { action: 'skip' };

  const timeNum = hasTime ? (entry.time == null || entry.time === '' ? null : Number(entry.time)) : undefined;
  const statusValue = hasStatus ? (RESULT_STATUSES.includes(entry.status) ? entry.status : null) : undefined;

  // Clearing this result: the touched time field was blanked, and there's
  // no status override alongside it asserting a real outcome (e.g. DNS/
  // DNF with no time) — an untouched status here means "no opinion," not
  // "confirmed FINISHED with nothing typed," so it doesn't count as one.
  if (hasTime && timeNum == null && (!hasStatus || !statusValue)) {
    return { action: 'delete' };
  }
  if (hasTime && timeNum != null && (!Number.isFinite(timeNum) || timeNum <= 0)) {
    return { action: 'skip' }; // invalid time — never written, never deletes an existing valid result either
  }

  const data = {};
  if (hasTime) data.time = timeNum;
  if (hasStatus) data.status = statusValue || 'FINISHED';
  return { action: 'upsert', data };
}

// Every result across a meet's races, joined with athlete info,
// flattened and ordered for export (MeetDetailPage's "Export CSV"
// button — see GET /:meetId/results in routes/meetOps.js). `races` is
// [{id, name}] in display order; `results` is already joined to
// {raceId, athleteId, name, grade, gender, time, status}. Sorted by
// race (in the given order), then by time ascending within a race — a
// non-finisher (no time) sorts to the end of their race rather than
// before every finisher.
function flattenMeetResults(races, results) {
  const raceOrder = new Map(races.map((r, i) => [r.id, i]));
  const raceNameById = new Map(races.map((r) => [r.id, r.name]));
  return results
    .map((r) => ({ ...r, raceName: raceNameById.get(r.raceId) ?? '' }))
    .sort((a, b) => {
      const orderDiff = (raceOrder.get(a.raceId) ?? 0) - (raceOrder.get(b.raceId) ?? 0);
      if (orderDiff !== 0) return orderDiff;
      if (a.time == null && b.time == null) return 0;
      if (a.time == null) return 1;
      if (b.time == null) return -1;
      return a.time - b.time;
    });
}

module.exports = { RESULT_STATUSES, decideResultWrite, flattenMeetResults };
