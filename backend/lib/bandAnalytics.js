// Pure band-analytics computation (Part B, XCApp Pre-Season Fixes + Phase 3
// doc). Split out of routes/bandAnalytics.js so the actual banding/ranking
// math can be unit-tested against constructed fixtures (test/
// bandAnalytics.test.js) without a live database — this sandbox has no
// DATABASE_URL, so anything that can only be verified against real team
// data (Verify Gate B) has to be provably correct here instead.
//
// Every function in this file takes plain data in and returns plain data
// out — no Prisma, no req/res. routes/bandAnalytics.js is responsible for
// fetching rows and shaping them into `entries` before calling in here.

const MIN_BAND_SIZE = 5; // doc: "Never render a band with fewer than 5 athletes"
const COLLAPSE_ROSTER_THRESHOLD = 50; // doc: under 50, collapse to two bands
const POSITION_SLOTS = [1, 3, 5, 7, 10];

const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

const median = (arr) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

// Population stdDev (divide by n, not n-1) — bands here are the entire
// population being described (every entry in that band that season), not a
// sample standing in for a larger one, and n can be as low as MIN_BAND_SIZE.
const stdDev = (arr, avg) => {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

// Fixed per season, based on that season+gender's roster depth. Collapses
// to two bands under the threshold rather than producing a near-empty
// middle band; never produces a negative-size middle (the collapse
// threshold is chosen so topSize + bottomSize < COLLAPSE_ROSTER_THRESHOLD).
function computeBandRanges(rosterSize, topSize, bottomSize) {
  if (rosterSize < COLLAPSE_ROSTER_THRESHOLD) {
    const collapsedTopSize = Math.max(1, Math.ceil(rosterSize / 3));
    return {
      collapsed: true,
      top: [1, collapsedTopSize],
      middle: null,
      bottom: [collapsedTopSize + 1, rosterSize],
    };
  }
  return {
    collapsed: false,
    top: [1, topSize],
    middle: [topSize + 1, rosterSize - bottomSize],
    bottom: [rosterSize - bottomSize + 1, rosterSize],
  };
}

function bandForRank(rank, ranges) {
  if (rank >= ranges.top[0] && rank <= ranges.top[1]) return 'top';
  if (ranges.middle && rank >= ranges.middle[0] && rank <= ranges.middle[1]) return 'middle';
  if (rank >= ranges.bottom[0] && rank <= ranges.bottom[1]) return 'bottom';
  return null;
}

// entries: [{ athleteId, raceId, paceSecPerMile, fieldRatio }]
function summarizeBand(entries, range) {
  if (!range) return null;

  const athleteCount = new Set(entries.map((e) => e.athleteId)).size;
  if (athleteCount < MIN_BAND_SIZE) {
    return { range, athleteCount, raceCount: 0, insufficientDepth: true };
  }

  const paces = entries.map((e) => e.paceSecPerMile);
  const paceMean = mean(paces);
  const ratios = entries.map((e) => e.fieldRatio).filter((r) => r != null);

  return {
    range,
    athleteCount,
    raceCount: new Set(entries.map((e) => e.raceId)).size,
    insufficientDepth: false,
    meanPaceSecPerMile: paceMean,
    medianPaceSecPerMile: median(paces),
    stdDevPaceSecPerMile: stdDev(paces, paceMean),
    ...(ratios.length > 0
      ? { meanFieldRatio: mean(ratios), medianFieldRatio: median(ratios) }
      : {}),
  };
}

// Assigns every entry to a band for one season, in one of two modes:
//
//   meet:   per-race rank within team+gender, compared against the
//           season's fixed boundaries — an athlete's band can differ
//           race to race. The season's aggregate for a band pools every
//           (athlete, race) entry whose rank AT THAT RACE fell in range.
//
//   season: rank by season-best pace within gender, fixed for the whole
//           season. Every FINISHED race that athlete ran this season
//           pools into their one fixed band (a richer sample than a
//           single best-time point, and symmetric with meet-mode pooling
//           more than one data point per band).
//
// entries: [{ athleteId, paceSecPerMile }] (raceId/time/fieldRatio ignored
// here — only the per-athlete season-best pace matters for a rank). An
// athlete with multiple races contributes multiple entries; only their
// best pace counts. Returns rank 1 = fastest. Shared with
// lib/athleteJourney.js — an athlete's rank on their own journey page has
// to be the same number Program (Band Trends) would compute for them, so
// there is exactly one place this ranking happens.
function rankAthletesBySeasonBestPace(entries) {
  const bestByAthlete = new Map();
  for (const e of entries) {
    const current = bestByAthlete.get(e.athleteId);
    if (current === undefined || e.paceSecPerMile < current) {
      bestByAthlete.set(e.athleteId, e.paceSecPerMile);
    }
  }
  const ranked = [...bestByAthlete.entries()]
    .map(([athleteId, bestPaceSecPerMile]) => ({ athleteId, bestPaceSecPerMile }))
    .sort((a, b) => a.bestPaceSecPerMile - b.bestPaceSecPerMile);

  const byAthleteId = new Map();
  ranked.forEach((r, i) => byAthleteId.set(r.athleteId, { rank: i + 1, bestPaceSecPerMile: r.bestPaceSecPerMile }));
  return { ranked, byAthleteId, rosterSize: ranked.length };
}

// entries: [{ athleteId, raceId, time, paceSecPerMile, fieldRatio }]
function assignBandEntries(entries, mode, ranges) {
  const bandEntries = { top: [], middle: [], bottom: [] };

  if (mode === 'meet') {
    const byRace = new Map();
    for (const e of entries) {
      if (!byRace.has(e.raceId)) byRace.set(e.raceId, []);
      byRace.get(e.raceId).push(e);
    }
    for (const raceEntries of byRace.values()) {
      const ranked = [...raceEntries].sort((a, b) => a.time - b.time);
      ranked.forEach((e, i) => {
        const band = bandForRank(i + 1, ranges);
        if (band) bandEntries[band].push(e);
      });
    }
  } else {
    const { byAthleteId } = rankAthletesBySeasonBestPace(entries);
    const athleteBand = new Map();
    for (const [athleteId, { rank }] of byAthleteId) {
      const band = bandForRank(rank, ranges);
      if (band) athleteBand.set(athleteId, band);
    }

    for (const e of entries) {
      const band = athleteBand.get(e.athleteId);
      if (band) bandEntries[band].push(e);
    }
  }

  return bandEntries;
}

// The team's own Nth-fastest finisher (by time, within team+gender+race)
// at positions 1/3/5/7/10, averaged across every race in `entries`. Only
// races with a finisher at that position contribute to that position's
// average.
function computePositionCurve(entries) {
  const byRace = new Map();
  for (const e of entries) {
    if (!byRace.has(e.raceId)) byRace.set(e.raceId, []);
    byRace.get(e.raceId).push(e);
  }
  return POSITION_SLOTS.map((position) => {
    const times = [];
    for (const raceEntries of byRace.values()) {
      const ranked = [...raceEntries].sort((a, b) => a.time - b.time);
      if (ranked.length >= position) times.push(ranked[position - 1].time);
    }
    return times.length > 0
      ? { position, avgTimeSec: mean(times), raceCount: times.length }
      : { position, avgTimeSec: null, raceCount: 0 };
  });
}

// entries: [{ athleteId, raceId, time, paceSecPerMile, fieldRatio }] for
// one season (already filtered to team + gender + FINISHED + course, if
// requested). Returns the full per-season payload the route responds with.
function computeSeasonPayload(entries, { mode, topSize, bottomSize }) {
  const rosterSize = new Set(entries.map((e) => e.athleteId)).size;

  if (rosterSize < MIN_BAND_SIZE) {
    return { rosterSize, insufficientDepth: true, bands: null, positionCurve: [] };
  }

  const ranges = computeBandRanges(rosterSize, topSize, bottomSize);
  const bandEntries = assignBandEntries(entries, mode, ranges);

  const bands = {
    top: summarizeBand(bandEntries.top, ranges.top),
    middle: ranges.middle ? summarizeBand(bandEntries.middle, ranges.middle) : null,
    bottom: summarizeBand(bandEntries.bottom, ranges.bottom),
  };

  return { rosterSize, insufficientDepth: false, bands, positionCurve: computePositionCurve(entries) };
}

module.exports = {
  MIN_BAND_SIZE,
  COLLAPSE_ROSTER_THRESHOLD,
  POSITION_SLOTS,
  computeBandRanges,
  bandForRank,
  rankAthletesBySeasonBestPace,
  summarizeBand,
  assignBandEntries,
  computePositionCurve,
  computeSeasonPayload,
};
