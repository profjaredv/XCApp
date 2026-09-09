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
  if (hasTime) {
    data.time = timeNum;
  } else if (hasStatus && statusValue && statusValue !== 'FINISHED') {
    // Marking a non-finish (DNF/DNS/DQ) without touching time in this
    // same save must not leave a previously-saved time in place — a
    // stale nonzero time sitting next to a DNS/DNF status is exactly
    // what let that row keep ranking as a real (even "fastest") finisher
    // anywhere downstream sorted or filtered by time without also
    // checking status. Unlike every other field here, status and time
    // aren't independent: a non-finish and a real time are mutually
    // exclusive, so this is the status field's own necessary
    // consequence, not the "touch only what's touched" rule being
    // broken for some unrelated field.
    data.time = null;
  }
  if (hasStatus) data.status = statusValue || 'FINISHED';
  return { action: 'upsert', data };
}

// A result only counts as a real, rankable time when it's a genuine
// finish — status FINISHED AND a positive time. Checking time alone
// (even "time != null") isn't enough: a DNS/DNF/DQ row can still be
// sitting on a stale nonzero time saved before the status was changed
// (decideResultWrite above stops this for new writes, but doesn't
// retroactively clean up whatever a coach already saved before that
// fix existed) — treating that as a real time is exactly what let a
// non-finisher rank as a "fastest" runner anywhere sorted by time
// without also checking status.
function isRankableFinish(result) {
  return result.status === 'FINISHED' && typeof result.time === 'number' && result.time > 0;
}

// Fastest-to-slowest; anyone who isn't a rankable finish (see above)
// sorts to the end, in whatever order they were already in.
function compareByFinishTime(a, b) {
  const aOk = isRankableFinish(a);
  const bOk = isRankableFinish(b);
  if (aOk && bOk) return a.time - b.time;
  if (aOk) return -1;
  if (bOk) return 1;
  return 0;
}

// Every result across a meet's races, joined with athlete info,
// flattened and ordered for export (MeetDetailPage's "Export CSV"
// button — see GET /:meetId/results in routes/meetOps.js). `races` is
// [{id, name}] in display order; `results` is already joined to
// {raceId, athleteId, name, grade, gender, time, status}. Sorted by
// race (in the given order), then fastest-to-slowest within each.
function flattenMeetResults(races, results) {
  const raceOrder = new Map(races.map((r, i) => [r.id, i]));
  const raceNameById = new Map(races.map((r) => [r.id, r.name]));
  return results
    .map((r) => ({ ...r, raceName: raceNameById.get(r.raceId) ?? '' }))
    .sort((a, b) => {
      const orderDiff = (raceOrder.get(a.raceId) ?? 0) - (raceOrder.get(b.raceId) ?? 0);
      return orderDiff !== 0 ? orderDiff : compareByFinishTime(a, b);
    });
}

module.exports = { RESULT_STATUSES, decideResultWrite, flattenMeetResults, isRankableFinish, compareByFinishTime };
