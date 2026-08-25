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

module.exports = { RESULT_STATUSES, decideResultWrite };
