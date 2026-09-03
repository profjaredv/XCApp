// "How do I take 20 seconds off my next race?"
//
// A strategy session, built only from the athlete's own races. Every number
// here is arithmetic on times they have already run — nothing is predicted,
// nothing is modelled, and no coefficient is invented to make an estimate
// look precise. That constraint is the point: a coach standing next to an
// athlete has to be able to say where a number came from, and "the app
// estimated it" is not an answer either of them can use.
//
// Three rules the levers below all follow:
//
//   1. Every lever is a gap between two things the athlete actually did.
//      Their best race against their typical one. Their last mile against
//      their first. This season against last. Those gaps are facts.
//   2. A ceiling is labelled a ceiling. Closing at first-mile pace is
//      arithmetic, not a plan — nobody holds it — so it is reported as the
//      most that pacing could be worth, never as a target.
//   3. What is missing is said out loud. No splits entered means the
//      pacing lever cannot be computed at all, and a screen that quietly
//      omits it teaches an athlete their pacing is fine.

const MILE_IN_METERS = 1609.34;

/** Under this many races there is no "typical" to compare a best against. */
const MIN_RACES_FOR_TYPICAL = 3;
/** Seconds per mile below which two paces are the same race run twice. */
const NOISE_SEC_PER_MILE = 3;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatTime(seconds) {
  if (!(seconds > 0)) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function lever(id, title, detail, seconds, confidence, evidence) {
  return { id, title, detail, seconds, confidence, evidence };
}

/**
 * The gap between their best race and their typical one, over the target
 * distance.
 *
 * This is the strongest lever in the file and the least speculative: it is
 * a time they have already run. "You have been 26 seconds faster than your
 * normal race" is not a projection, it is a fact with a date on it.
 */
function bestVsTypical(races, distanceMeters) {
  const paces = races.map((r) => r.paceSecPerMile).filter((p) => p > 0);
  if (paces.length < MIN_RACES_FOR_TYPICAL) return null;

  const bestPace = Math.min(...paces);
  const typicalPace = median(paces);
  const gapPerMile = typicalPace - bestPace;
  if (gapPerMile < NOISE_SEC_PER_MILE) return null;

  const miles = distanceMeters / MILE_IN_METERS;
  const seconds = gapPerMile * miles;
  const bestRace = races.find((r) => r.paceSecPerMile === bestPace);

  return lever(
    'best-vs-typical',
    'Run the race you have already run.',
    `Your best pace this season is ${Math.round(gapPerMile)}s/mi quicker than your typical race${
      bestRace ? ` — that was ${bestRace.raceName}` : ''
    }. Over this distance that gap is worth ${Math.round(seconds)} seconds, and it needs nothing you have not already done once.`,
    Math.round(seconds),
    'measured',
    { bestPaceSecPerMile: bestPace, typicalPaceSecPerMile: typicalPace, raceCount: paces.length, bestRace: bestRace?.raceName ?? null }
  );
}

/**
 * Pacing: what fading costs, from their own splits.
 *
 * Reported as a ceiling, deliberately. The arithmetic — "hold your first
 * mile's pace to the finish" — is not something any runner does, and
 * dressing it up with a fudge factor would make it look like a prediction
 * rather than the boundary it is.
 */
function pacingCeiling(splitAggregate) {
  if (!splitAggregate) return null;
  const segments = (splitAggregate.segmentAverages || []).filter((s) => s.avgPaceSecPerMile > 0);
  if (segments.length < 2) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const fadePerMile = last.avgPaceSecPerMile - first.avgPaceSecPerMile;
  if (fadePerMile < NOISE_SEC_PER_MILE) {
    return lever(
      'pacing',
      'Your pacing is already even.',
      `Across ${splitAggregate.raceCount} race${splitAggregate.raceCount === 1 ? '' : 's'} with splits, your last segment averages within ${Math.abs(
        Math.round(fadePerMile)
      )}s/mi of your first. There is nothing to reclaim here — the time is somewhere else.`,
      0,
      'measured',
      { firstPaceSecPerMile: first.avgPaceSecPerMile, lastPaceSecPerMile: last.avgPaceSecPerMile }
    );
  }

  // Only the fading segments, each priced at what it lost against the
  // opener, over that segment's own distance.
  let ceilingSeconds = 0;
  for (const segment of segments.slice(1)) {
    const slowerBy = segment.avgPaceSecPerMile - first.avgPaceSecPerMile;
    if (slowerBy <= 0) continue;
    const segmentMiles = segment.avgSegmentSec / segment.avgPaceSecPerMile;
    ceilingSeconds += slowerBy * segmentMiles;
  }

  return lever(
    'pacing',
    'You are finishing slower than you start.',
    `Your ${last.label.toLowerCase()} averages ${Math.round(fadePerMile)}s/mi slower than your ${first.label.toLowerCase()}, across ${
      splitAggregate.raceCount
    } race${splitAggregate.raceCount === 1 ? '' : 's'} with splits. Holding your opening pace all the way would be about ${Math.round(
      ceilingSeconds
    )} seconds — that is the ceiling, not a target. Nobody holds mile-one pace to the finish; the useful version is going out a few seconds slower and losing less at the end.`,
    Math.round(ceilingSeconds),
    'ceiling',
    {
      firstSegment: first.label,
      lastSegment: last.label,
      fadeSecPerMile: parseFloat(fadePerMile.toFixed(1)),
      pattern: splitAggregate.pattern?.predominant ?? null,
      raceCount: splitAggregate.raceCount,
    }
  );
}

/**
 * The trend they are already on.
 *
 * First race of the season against most recent. Not extrapolated — an
 * athlete improving 8s a race is not going to improve 8s a race forever,
 * and saying so would be inventing a curve.
 */
function seasonTrend(races, distanceMeters) {
  const dated = races
    .filter((r) => r.paceSecPerMile > 0 && r.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (dated.length < MIN_RACES_FOR_TYPICAL) return null;

  const first = dated[0];
  const latest = dated[dated.length - 1];
  const gainPerMile = first.paceSecPerMile - latest.paceSecPerMile;
  if (Math.abs(gainPerMile) < NOISE_SEC_PER_MILE) return null;

  const miles = distanceMeters / MILE_IN_METERS;
  const seconds = Math.round(gainPerMile * miles);

  if (gainPerMile > 0) {
    return lever(
      'trend',
      'You are already getting faster.',
      `From ${first.raceName} to ${latest.raceName} you have taken ${seconds} seconds off at this distance. Keeping that going is its own answer — this is the one lever that needs no change of plan.`,
      null,
      'context',
      { firstRace: first.raceName, latestRace: latest.raceName, gainSecPerMile: parseFloat(gainPerMile.toFixed(1)) }
    );
  }

  return lever(
    'trend',
    'Your recent races are slower than your early ones.',
    `${latest.raceName} was ${Math.abs(seconds)} seconds slower than ${first.raceName} at this distance. Courses and weather differ, so this is worth a conversation before it is worth a training change.`,
    null,
    'context',
    { firstRace: first.raceName, latestRace: latest.raceName, gainSecPerMile: parseFloat(gainPerMile.toFixed(1)) }
  );
}

/** Consistency: how much their races scatter, which is a lever by itself. */
function consistency(races, distanceMeters) {
  const paces = races.map((r) => r.paceSecPerMile).filter((p) => p > 0);
  if (paces.length < MIN_RACES_FOR_TYPICAL) return null;
  const spread = Math.max(...paces) - Math.min(...paces);
  if (spread < NOISE_SEC_PER_MILE * 2) return null;
  const miles = distanceMeters / MILE_IN_METERS;
  return lever(
    'consistency',
    `Your races vary by ${Math.round(spread * miles)} seconds.`,
    `Best to worst, at this distance. A wide spread usually means the race plan changes race to race — same effort, different opening pace. Narrowing it is worth more than it sounds, because the floor comes up even when the ceiling doesn't.`,
    null,
    'context',
    { spreadSecPerMile: parseFloat(spread.toFixed(1)), raceCount: paces.length }
  );
}

/** What the app cannot see, and what would fix it. */
function gaps(races, splitAggregate) {
  const out = [];
  if (!splitAggregate) {
    out.push(
      lever(
        'gap-splits',
        'No splits entered for these races.',
        'Pacing is the biggest single lever in a cross country race and it cannot be computed from a finish time. One race with mile splits is enough to see whether the time is being lost early or late.',
        null,
        'gap',
        {}
      )
    );
  }
  if (races.length < MIN_RACES_FOR_TYPICAL) {
    out.push(
      lever(
        'gap-races',
        `Only ${races.length} race${races.length === 1 ? '' : 's'} at this distance.`,
        'Most of what this screen can say comes from comparing races against each other. After three at the same distance it has something to work with.',
        null,
        'gap',
        { raceCount: races.length }
      )
    );
  }
  return out;
}

/**
 * Build the session.
 *
 * @param races [{ raceId, raceName, date, timeSec, distanceMeters, paceSecPerMile }] one distance bucket
 * @param splitAggregate one entry from lib/splitAggregates.js, or null
 * @param targetSec what they are trying to take off (default 20)
 */
function buildStrategy({ races, splitAggregate, distanceMeters, targetSec = 20 }) {
  const usable = (races || []).filter((r) => r.paceSecPerMile > 0);
  const meters = distanceMeters || usable[0]?.distanceMeters || 5000;

  const levers = [
    bestVsTypical(usable, meters),
    pacingCeiling(splitAggregate),
    seasonTrend(usable, meters),
    consistency(usable, meters),
  ].filter(Boolean);

  // Only measured levers count toward the goal. A ceiling is not seconds
  // in the bank and context is not seconds at all — adding either would
  // turn an honest total into a promise.
  const measured = levers.filter((l) => l.confidence === 'measured' && l.seconds > 0);
  const measuredTotal = measured.reduce((sum, l) => sum + l.seconds, 0);
  const ceilings = levers.filter((l) => l.confidence === 'ceiling' && l.seconds > 0);

  const best = usable.length > 0 ? usable.reduce((a, b) => (a.timeSec < b.timeSec ? a : b)) : null;

  return {
    targetSec,
    distanceMeters: meters,
    raceCount: usable.length,
    bestTimeSec: best?.timeSec ?? null,
    /** What the target would look like off their best — the number they came for. */
    targetTimeSec: best ? Math.max(0, best.timeSec - targetSec) : null,
    targetTimeLabel: best ? formatTime(Math.max(0, best.timeSec - targetSec)) : null,
    measuredTotalSec: measuredTotal,
    ceilingTotalSec: ceilings.reduce((sum, l) => sum + l.seconds, 0),
    /** True when their own range already covers the goal — no new fitness required. */
    withinReach: measuredTotal >= targetSec,
    levers,
    gaps: gaps(usable, splitAggregate),
  };
}

module.exports = {
  MILE_IN_METERS,
  MIN_RACES_FOR_TYPICAL,
  NOISE_SEC_PER_MILE,
  median,
  bestVsTypical,
  pacingCeiling,
  seasonTrend,
  consistency,
  buildStrategy,
};
