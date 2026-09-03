const { segments, splitAnalysis, overallPaceSecPerMile } = require('./splitMath');

// One row per Result, shaped the way lib/splitAggregates.js expects.
//
// Lifted out of routes/splits.js when the strategy session needed the same
// shape: three routes across two files now feed the same aggregate, and a
// second hand-rolled version of this would be a second set of answers about
// how an athlete paces themselves.
//
// results: Prisma Result rows with `race` and `splits` included.
function buildAthleteSplitRows(results) {
  return (results || []).map((r) => {
    const splitInputs = r.splits.map((s) => ({
      sequence: s.sequence,
      markerMeters: s.markerMeters,
      elapsedSec: s.elapsedSec,
    }));
    const segs = r.race.distanceMeters ? segments(splitInputs, r.time, r.race.distanceMeters) : [];
    return {
      resultId: r.id,
      raceId: r.race.id,
      raceName: r.race.name,
      date: r.race.date,
      distanceMeters: r.race.distanceMeters,
      // Carried through for lib/splitAggregates.js, which buckets by
      // distance AND scheme: two 5Ks marked in miles vs kilometres have
      // segments that are not comparable, and averaging them positionally
      // is wrong. Without this field every race defaulted to MILE and the
      // bucketing had no effect at all.
      splitMarkerScheme: r.race.splitMarkerScheme,
      finishSec: r.time,
      segments: segs,
      analysis: splitAnalysis(segs),
      overallPaceSecPerMile: r.race.distanceMeters ? overallPaceSecPerMile(r.time, r.race.distanceMeters) : null,
    };
  });
}

module.exports = { buildAthleteSplitRows };
