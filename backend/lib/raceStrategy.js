// "How do I take 20 seconds off my next race?"
//
// A strategy session, built only from the athlete's own races. Every number
// here is worked out from times they have already run — nothing is
// predicted, nothing is modelled, and no coefficient is invented to make an
// estimate look precise.
//
// WHO READS THIS: a sixteen-year-old, on their phone, the week of a race.
// That governs every string in this file. Rules for the copy:
//
//   - Say the number first, in the title. "You fade 36 seconds per mile"
//     beats "Pacing analysis".
//   - Say what to DO. A finding with no instruction is a stat, and they
//     have plenty of stats.
//   - Short sentences. No "arithmetic", no "lever", no "ceiling" as a bare
//     noun, no "execution". If a coach wouldn't say it standing on a
//     start line, it doesn't go here.
//   - Seconds, not seconds-per-mile, wherever the race distance lets us
//     convert. "62 seconds" is a time they can picture; "62s/mi" is a unit
//     they have to do maths on.
//
// And the honesty rules that came first and still hold:
//
//   1. Every finding is a gap between two things the athlete actually did.
//      Their best race against their typical one. Their last mile against
//      their first.
//   2. A ceiling is labelled as one. Holding first-mile pace to the finish
//      is arithmetic, not a plan, so it is never given as a target.
//   3. What is missing is said out loud. No splits means the pacing
//      finding cannot be computed, and a screen that quietly omits it
//      teaches an athlete their pacing is fine.

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


// Where a race gets split, by distance. These are the marks an athlete
// actually hears called out: laps on a track, miles on a course.
const SPLIT_PLANS = [
  { meters: 1600, tolerance: 60, marks: [400, 800, 1200], unit: 'm' },
  { meters: 3200, tolerance: 60, marks: [800, 1600, 2400], unit: 'm' },
  { meters: 3000, tolerance: 60, marks: [1000, 2000], unit: 'm' },
  { meters: 5000, tolerance: 120, marks: [MILE_IN_METERS, MILE_IN_METERS * 2, MILE_IN_METERS * 3], unit: 'mi' },
  { meters: 8000, tolerance: 200, marks: [MILE_IN_METERS, MILE_IN_METERS * 2, MILE_IN_METERS * 3, MILE_IN_METERS * 4], unit: 'mi' },
];

function markLabel(meters, unit, index) {
  if (unit === 'mi') return `Mile ${index + 1}`;
  return `${Math.round(meters)}m`;
}

/**
 * The splits to run for a goal time.
 *
 * Even pace, deliberately. An even-split plan is the target time divided by
 * the distance and nothing else — no fast-start allowance, no negative-split
 * curve, because any shape other than even would be a coaching opinion
 * dressed up as this athlete's own data.
 */
function buildRacePlan(targetTimeSec, distanceMeters) {
  if (!(targetTimeSec > 0) || !(distanceMeters > 0)) return null;
  const plan = SPLIT_PLANS.find((p) => Math.abs(distanceMeters - p.meters) <= p.tolerance);
  const marks = plan ? plan.marks : [distanceMeters / 3, (distanceMeters * 2) / 3];
  const unit = plan ? plan.unit : 'm';

  const splits = marks.map((markMeters, index) => {
    const cumulativeSec = targetTimeSec * (markMeters / distanceMeters);
    const previous = index === 0 ? 0 : targetTimeSec * (marks[index - 1] / distanceMeters);
    return {
      label: markLabel(markMeters, unit, index),
      meters: markMeters,
      cumulativeSec,
      segmentSec: cumulativeSec - previous,
    };
  });

  const lastMark = marks[marks.length - 1];
  splits.push({
    label: 'Finish',
    meters: distanceMeters,
    cumulativeSec: targetTimeSec,
    segmentSec: targetTimeSec - targetTimeSec * (lastMark / distanceMeters),
  });

  return { targetTimeSec, distanceMeters, splits };
}

/**
 * One instruction for race day, from this athlete's own pattern.
 *
 * Not generic advice: each branch is a thing their splits or their results
 * actually show. Where nothing shows, it says to go get the data rather
 * than making something up.
 */
function raceDayInstruction(splitAggregate, firstSplitTargetSec) {
  if (!splitAggregate) {
    return 'Get someone to call out your time at every mile this race. Without splits, nobody can tell whether you are losing the time early or late.';
  }
  const segments = (splitAggregate.segmentAverages || []).filter((s) => s.avgPaceSecPerMile > 0);
  if (segments.length < 2) {
    return 'Get someone to call out your time at every mile this race. One race of splits is enough to see where the time goes.';
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  const fade = last.avgPaceSecPerMile - first.avgPaceSecPerMile;
  const target = firstSplitTargetSec != null ? ` Hit ${formatTime(firstSplitTargetSec)} at the first mark, not faster.` : '';

  if (fade < NOISE_SEC_PER_MILE) {
    return `Your pacing is already even, so run these splits and hold on.${target}`;
  }
  const startFast = first.avgPaceSecPerMile - (splitAggregate.overallAveragePaceSecPerMile ?? first.avgPaceSecPerMile);
  if (startFast < -NOISE_SEC_PER_MILE) {
    return `You normally start about ${Math.abs(Math.round(startFast))} seconds a mile quicker than you finish the race at, and it costs you at the end. Go out at goal pace instead.${target}`;
  }
  return `You lose most of your time in the back half, so the first mark is the one that matters. Do not beat it.${target}`;
}

function lever(id, title, detail, seconds, confidence, evidence) {
  return { id, title, detail, seconds, confidence, evidence };
}

/**
 * The gap between their best race and their typical one.
 *
 * The strongest finding in the file and the least speculative: it is a time
 * they have already run. "You have already been 26 seconds faster than your
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
  const seconds = Math.round(gapPerMile * miles);
  const bestRace = races.find((r) => r.paceSecPerMile === bestPace);

  return lever(
    'best-vs-typical',
    `You have already run ${seconds} seconds faster than your normal race.`,
    `Your best race this season was ${bestRace ? bestRace.raceName : 'earlier this season'}${
      bestRace && bestRace.timeSec ? ` (${formatTime(bestRace.timeSec)})` : ''
    }. Every other race has been slower than that. Run that race again and the ${seconds} seconds are there. You do not need to be fitter — you have done it once already.`,
    seconds,
    'measured',
    {
      bestPaceSecPerMile: bestPace,
      typicalPaceSecPerMile: typicalPace,
      raceCount: paces.length,
      bestRace: bestRace?.raceName ?? null,
    }
  );
}

/**
 * What fading costs, from their own splits.
 *
 * Reported as a ceiling, deliberately. "Hold your first mile's pace to the
 * finish" is not something any runner does, and dressing it up with a fudge
 * factor would turn a boundary into a promise. What they can act on is the
 * first split, which is in the race plan.
 */
function pacingCeiling(splitAggregate) {
  if (!splitAggregate) return null;
  const segments = (splitAggregate.segmentAverages || []).filter((s) => s.avgPaceSecPerMile > 0);
  if (segments.length < 2) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const fadePerMile = last.avgPaceSecPerMile - first.avgPaceSecPerMile;
  const raceWord = `${splitAggregate.raceCount} race${splitAggregate.raceCount === 1 ? '' : 's'}`;

  if (fadePerMile < NOISE_SEC_PER_MILE) {
    return lever(
      'pacing',
      'You run the whole race at about the same speed.',
      `Across ${raceWord} with splits, your last ${last.label.toLowerCase()} is within ${Math.abs(
        Math.round(fadePerMile)
      )} seconds a mile of your first. That is good pacing. The time you are looking for is somewhere else.`,
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
    `You slow down ${Math.round(fadePerMile)} seconds a mile by the end of the race.`,
    `Across ${raceWord} with splits, your ${last.label.toLowerCase()} is that much slower than your ${first.label.toLowerCase()}. If you held your opening speed the whole way you would save about ${Math.round(
      ceilingSeconds
    )} seconds. Nobody holds it perfectly, so treat that as the size of the problem, not the plan. The plan is the splits at the top of this page: go out at goal pace and you will have more left at the end.`,
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
 * athlete improving 8 seconds a race is not going to improve 8 seconds a
 * race forever, and saying so would be inventing a curve.
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
      `You are ${seconds} seconds faster than your first race of the season.`,
      `${first.raceName} to ${latest.raceName}. Whatever you have been doing in training is working. Keep doing it — this part needs no change at all.`,
      null,
      'context',
      { firstRace: first.raceName, latestRace: latest.raceName, gainSecPerMile: parseFloat(gainPerMile.toFixed(1)) }
    );
  }

  return lever(
    'trend',
    `Your last race was ${Math.abs(seconds)} seconds slower than your first one.`,
    `${latest.raceName} against ${first.raceName}. Courses and weather are not the same every week, so this is worth talking to your coach about before changing anything.`,
    null,
    'context',
    { firstRace: first.raceName, latestRace: latest.raceName, gainSecPerMile: parseFloat(gainPerMile.toFixed(1)) }
  );
}

/** How much their races swing, which is a finding by itself. */
function consistency(races, distanceMeters) {
  const paces = races.map((r) => r.paceSecPerMile).filter((p) => p > 0);
  if (paces.length < MIN_RACES_FOR_TYPICAL) return null;
  const spread = Math.max(...paces) - Math.min(...paces);
  if (spread < NOISE_SEC_PER_MILE * 2) return null;
  const miles = distanceMeters / MILE_IN_METERS;
  return lever(
    'consistency',
    `Your best and worst races are ${Math.round(spread * miles)} seconds apart.`,
    'Same distance, same season, same you. A swing that big is usually how the race is started, not how fit you were that day. Run the same opening split every time and the bad days get a lot closer to the good ones.',
    null,
    'context',
    { spreadSecPerMile: parseFloat(spread.toFixed(1)), raceCount: paces.length }
  );
}

/** What the app cannot see, and how to fix it. */
function gaps(races, splitAggregate) {
  const out = [];
  if (!splitAggregate) {
    out.push(
      lever(
        'gap-splits',
        'Nobody is taking your splits.',
        'Pacing is the biggest single thing you control in a race, and a finish time cannot show it. Ask a coach, a parent or a teammate to call out your time at every mile. One race is enough to see whether you are losing the time early or late.',
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
        `You have only run this distance ${races.length} time${races.length === 1 ? '' : 's'}.`,
        'Most of this page comes from comparing your races against each other. After three or four at the same distance there is enough to tell a good day from your real level.',
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

  // Only measured findings count toward the goal. A ceiling is not seconds
  // in the bank and context is not seconds at all — adding either would
  // turn an honest total into a promise.
  const measured = levers.filter((l) => l.confidence === 'measured' && l.seconds > 0);
  const measuredTotal = measured.reduce((sum, l) => sum + l.seconds, 0);
  const ceilings = levers.filter((l) => l.confidence === 'ceiling' && l.seconds > 0);

  const best = usable.length > 0 ? usable.reduce((a, b) => (a.timeSec < b.timeSec ? a : b)) : null;
  const targetTimeSec = best ? Math.max(0, best.timeSec - targetSec) : null;

  // The splits to actually run, and one thing to do about them. This is
  // the part an athlete takes to the start line; everything above is why.
  const plan = targetTimeSec ? buildRacePlan(targetTimeSec, meters) : null;
  const instruction = raceDayInstruction(splitAggregate, plan?.splits?.[0]?.cumulativeSec ?? null);

  return {
    targetSec,
    distanceMeters: meters,
    raceCount: usable.length,
    bestTimeSec: best?.timeSec ?? null,
    bestRaceName: best?.raceName ?? null,
    /** What the target would look like off their best — the number they came for. */
    targetTimeSec,
    targetTimeLabel: targetTimeSec != null ? formatTime(targetTimeSec) : null,
    measuredTotalSec: measuredTotal,
    ceilingTotalSec: ceilings.reduce((sum, l) => sum + l.seconds, 0),
    /** True when their own range already covers the goal — no new fitness required. */
    withinReach: measuredTotal >= targetSec,
    plan,
    instruction,
    levers,
    gaps: gaps(usable, splitAggregate),
  };
}

module.exports = {
  MILE_IN_METERS,
  buildRacePlan,
  raceDayInstruction,
  MIN_RACES_FOR_TYPICAL,
  NOISE_SEC_PER_MILE,
  median,
  bestVsTypical,
  pacingCeiling,
  seasonTrend,
  consistency,
  buildStrategy,
};
