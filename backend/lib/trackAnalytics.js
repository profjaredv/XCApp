// Track & Field analytics, pure and DB-free so the arithmetic is testable
// on its own. Every function takes plain result rows:
//   { eventId, athleteId, markValue, status, round, place, season, date, ... }
// and an event lookup carrying scoringDirection. A markValue is only ever
// compared with another from the SAME event, so units never mix.

// The common top-eight table. Meets differ (duals score 5-3-1, some
// invitationals score six places), so this is a labelled default the caller
// can override, never presented as the one true table.
const DEFAULT_SCORING_TABLE = [10, 8, 6, 5, 4, 3, 2, 1];

/** "10,8,6,5,4,3,2,1" -> [10, 8, ...]; null for anything missing or malformed, so the caller falls back to the default. */
function parseScoringTable(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length > 16 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

const counts = (r) => r.status === 'FINISHED' && r.markValue != null && Number.isFinite(r.markValue);

function isBetter(a, b, direction) {
  return direction === 'HIGHER_BETTER' ? a > b : a < b;
}

/** The best counting row in a list for one event, or null. */
function bestOf(rows, direction) {
  let best = null;
  for (const r of rows) {
    if (!counts(r)) continue;
    if (!best || isBetter(r.markValue, best.markValue, direction)) best = r;
  }
  return best;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/**
 * Per event: each athlete's best mark, ranked best first.
 * @returns [{ event, leaders: [bestRow, ...] }] in catalog order, events with no marks omitted.
 */
function seasonLeaders(results, events) {
  const byEvent = groupBy(results.filter((r) => r.athleteId), (r) => r.eventId);
  const out = [];
  for (const event of [...events].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const rows = byEvent.get(event.id);
    if (!rows) continue;
    const leaders = [];
    for (const athleteRows of groupBy(rows, (r) => r.athleteId).values()) {
      const best = bestOf(athleteRows, event.scoringDirection);
      if (best) leaders.push(best);
    }
    if (!leaders.length) continue;
    leaders.sort((a, b) => (isBetter(a.markValue, b.markValue, event.scoringDirection) ? -1 : a.markValue === b.markValue ? 0 : 1));
    out.push({ event, leaders });
  }
  return out;
}

/** Points one result scored: finals only, by place, per the table. */
function pointsFor(result, table = DEFAULT_SCORING_TABLE) {
  if (result.status !== 'FINISHED' || result.round === 'PRELIM') return 0;
  if (!Number.isInteger(result.place) || result.place < 1 || result.place > table.length) return 0;
  return table[result.place - 1];
}

/**
 * Points by event by season.
 * @returns { seasons: [2024, 2025, ...], events: [{ event, bySeason: { [year]: { points, scorers, entries } } }] }
 */
function pointsContribution(results, events, table = DEFAULT_SCORING_TABLE) {
  const seasons = [...new Set(results.map((r) => r.season))].sort((a, b) => a - b);
  const byEvent = groupBy(results, (r) => r.eventId);
  const out = [];
  for (const event of [...events].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const rows = byEvent.get(event.id);
    if (!rows) continue;
    const bySeason = {};
    for (const [season, seasonRows] of groupBy(rows, (r) => r.season)) {
      let points = 0;
      const scorers = new Set();
      const entrants = new Set();
      for (const r of seasonRows) {
        if (r.athleteId) entrants.add(r.athleteId);
        const p = pointsFor(r, table);
        if (p > 0) {
          points += p;
          if (r.athleteId) scorers.add(r.athleteId);
        }
      }
      bySeason[season] = { points, scorers: scorers.size, entrants: entrants.size };
    }
    out.push({ event, bySeason });
  }
  return { seasons, events: out };
}

/**
 * One athlete's history: per event, every result oldest first, flagged where
 * it set a new personal record, plus the best per season.
 */
function athleteProgression(results, events) {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const out = [];
  for (const [eventId, rows] of groupBy(results, (r) => r.eventId)) {
    const event = eventById.get(eventId);
    if (!event) continue;
    const ordered = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
    let pr = null;
    const marks = ordered.map((r) => {
      let isPr = false;
      if (counts(r) && (pr == null || isBetter(r.markValue, pr, event.scoringDirection))) {
        pr = r.markValue;
        isPr = true;
      }
      return { ...r, isPr };
    });
    const seasonBests = [...groupBy(ordered, (r) => r.season)]
      .map(([season, seasonRows]) => ({ season, best: bestOf(seasonRows, event.scoringDirection) }))
      .filter((s) => s.best)
      .sort((a, b) => a.season - b.season);
    out.push({ event, pr, marks, seasonBests });
  }
  return out.sort((a, b) => a.event.sortOrder - b.event.sortOrder);
}

module.exports = { DEFAULT_SCORING_TABLE, parseScoringTable, isBetter, bestOf, seasonLeaders, pointsFor, pointsContribution, athleteProgression };
