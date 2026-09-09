// "How much harder is this course than usual" — for the top-7 team
// finishers at a race, compare each one's pace THAT DAY to THEIR OWN
// average pace at every other race they ran that same season, then
// average those gaps. Athlete-relative on purpose, not a flat "this
// meet's top-7 pace vs that meet's top-7 pace": a different 7 runners
// can show up meet to meet (someone sick, a JV callup, ...), and
// comparing team-level top-7 paces across meets as if they were the
// same people would credit or blame the course for what's really just
// who ran. Comparing each runner to their own baseline cancels that out.
//
// Course-level (RaceComparisonTab, GET /course-difficulty/:meetName)
// then combines one race-level rating per season a coach's team has run
// this course, via the Course/MeetGroup grouping (lib/courseMapping.js) —
// "this course runs ~12 sec/mile hard" persisting across years, not just
// existing for one meet day.

// entries: [{ athleteId, pace }], pace in sec/mile, lower = faster.
// Ties keep their original relative order (Array.sort is stable).
function pickTopSevenByPace(entries) {
  return [...entries]
    .filter((e) => typeof e.pace === 'number' && e.pace > 0)
    .sort((a, b) => a.pace - b.pace)
    .slice(0, 7);
}

// entries: [{ athleteId, paceAtRace, baselinePace }] — baselinePace is
// null/undefined for an athlete with no other FINISHED race that season
// to compare against (their first race of the year, say); they're
// skipped from the average entirely, never counted as a 0 gap.
// Positive delta = ran slower here than their own average = harder
// course; negative = faster/easier.
function computeRaceDifficulty(entries) {
  const breakdown = entries.map((e) => {
    const hasBaseline = typeof e.baselinePace === 'number' && e.baselinePace > 0;
    return {
      athleteId: e.athleteId,
      paceAtRace: e.paceAtRace,
      baselinePace: hasBaseline ? e.baselinePace : null,
      deltaSecPerMile: hasBaseline ? e.paceAtRace - e.baselinePace : null,
    };
  });

  const withBaseline = breakdown.filter((e) => e.deltaSecPerMile != null);
  if (withBaseline.length === 0) {
    return { difficultySecPerMile: null, contributingCount: 0, breakdown };
  }

  const avgDelta = withBaseline.reduce((sum, e) => sum + e.deltaSecPerMile, 0) / withBaseline.length;
  return { difficultySecPerMile: avgDelta, contributingCount: withBaseline.length, breakdown };
}

// races: [{ difficultySecPerMile, contributingCount }] — one entry per
// season/visit to this course. Weighted by contributingCount (how many
// of that race's top 7 actually had a comparison baseline), the same
// "field-size-weighted, not a naive average of averages" reasoning as
// groupMeetMetricsByMeet's avgPace (lib/meetMapping.js) — a season where
// only 2 of the top 7 had a prior race that year shouldn't count as much
// as one where all 7 did. Null when no season ever produced a rating.
function computeCourseDifficulty(races) {
  const withData = races.filter((r) => typeof r.difficultySecPerMile === 'number' && r.contributingCount > 0);
  if (withData.length === 0) return null;

  const totalWeight = withData.reduce((sum, r) => sum + r.contributingCount, 0);
  const weightedSum = withData.reduce((sum, r) => sum + r.difficultySecPerMile * r.contributingCount, 0);
  return weightedSum / totalWeight;
}

module.exports = { pickTopSevenByPace, computeRaceDifficulty, computeCourseDifficulty };

// ---------------------------------------------------------------------
// Course-ADJUSTED paces: applying the rating instead of just reporting it.
//
// The problem this solves, in a coach's words: two 1-mile time trials in a
// season, one on a track and one on a hill. A runner goes 6:00 on the
// track and 6:20 on the hill. Raw times say he regressed 20 seconds. If
// the hill costs the team ~25 sec/mile, he actually improved by 5. Nothing
// in raw times can tell those apart.
//
// Adjusted pace = pace that day - that race's course effect, so every race
// in a season is expressed on one common course and the remainder is the
// runner. Two details make it actually correct rather than merely
// plausible:
//
// 1. LEAVE-ONE-OUT. A runner is usually one of the top 7 whose gaps define
//    the rating, so his own good or bad day is baked into the number being
//    subtracted from him. Adjusting an athlete uses the rating recomputed
//    WITHOUT him, so the result measures him against his teammates rather
//    than partly against himself. With a 7-man sample self-reference would
//    only shrink his signal by 1/7; on a small team contributing 2-3
//    runners it would gut it.
//
// 2. SHRINKAGE by (n-1)/n. A race's rating comes from comparing each
//    runner's pace there to the mean of his OTHER races, and that
//    comparison is systematically overstated. Writing e_r for a course's
//    effect and n for an athlete's races that season, his gap works out to
//    e_r - (sum(e) - e_r)/(n-1) = n/(n-1) * (e_r - mean(e)): the race is
//    missing from its own baseline, so the gap is inflated by n/(n-1).
//    Multiplying by (n-1)/n recovers e_r - mean(e), the honest "how much
//    harder than this season's average course".
//
//    At 8 races that correction is 12%; at 2 races it is a factor of two,
//    and skipping it is the difference between telling the coach his
//    runner improved 5 seconds and telling him 30. The factor is
//    per-athlete, not per-race, because the inflation comes from each
//    athlete's own race count.
//
// What "adjusted" is therefore relative TO: this season's average course
// for the team, not a track and not sea level. Adjusted values are
// comparable to each other within a season; they are not course-neutral
// absolute times, and callers should label them that way.

// paceSecPerMile of every FINISHED team result in ONE season:
//   [{ athleteId, raceId, paceSecPerMile }]
// Returns a Map raceId -> [{ athleteId, shrunkDelta }] for the top-7
// finishers who had a baseline, each already corrected by (n-1)/n. These
// are the per-race contributor lists that both the rating and every
// leave-one-out adjustment are built from.
function buildRaceContributors(results) {
  const byAthlete = new Map();
  const byRace = new Map();
  for (const r of results) {
    if (!(r.paceSecPerMile > 0)) continue;
    if (!byAthlete.has(r.athleteId)) byAthlete.set(r.athleteId, []);
    byAthlete.get(r.athleteId).push(r);
    if (!byRace.has(r.raceId)) byRace.set(r.raceId, []);
    byRace.get(r.raceId).push(r);
  }

  const contributorsByRace = new Map();
  for (const [raceId, entries] of byRace) {
    const topSeven = pickTopSevenByPace(
      entries.map((e) => ({ athleteId: e.athleteId, pace: e.paceSecPerMile }))
    );

    const contributors = [];
    for (const t of topSeven) {
      const own = byAthlete.get(t.athleteId) || [];
      const others = own.filter((r) => r.raceId !== raceId);
      // Their first race of the year has nothing to compare against —
      // skipped entirely rather than counted as a zero gap.
      if (others.length === 0) continue;
      const baseline = others.reduce((sum, r) => sum + r.paceSecPerMile, 0) / others.length;
      const rawDelta = t.pace - baseline;
      const shrink = (own.length - 1) / own.length;
      contributors.push({
        athleteId: t.athleteId,
        paceAtRace: t.pace,
        baselinePace: baseline,
        rawDelta,
        shrunkDelta: rawDelta * shrink,
      });
    }
    contributorsByRace.set(raceId, contributors);
  }
  return contributorsByRace;
}

// The mean shrunk gap, optionally ignoring one athlete (leave-one-out).
// Null when nobody is left to average — never 0, which would read as
// "measured, and this course is exactly average".
function averageDelta(contributors, excludeAthleteId) {
  const used = contributors.filter((c) => c.athleteId !== excludeAthleteId);
  if (used.length === 0) return { difficultySecPerMile: null, contributingCount: 0 };
  const sum = used.reduce((acc, c) => acc + c.shrunkDelta, 0);
  return { difficultySecPerMile: sum / used.length, contributingCount: used.length };
}

// results: [{ athleteId, raceId, paceSecPerMile }] for ONE season, the
// whole team (the ratings are only as good as the field they're built
// from, so callers should pass everyone, not just the athlete in view).
//
// Returns one row per input result:
//   { athleteId, raceId, paceSecPerMile,
//     courseDifficultySecPerMile,   // leave-one-out, as applied to THIS athlete
//     adjustedPaceSecPerMile,       // null when the race has no rating
//     contributingCount }
// adjustedPaceSecPerMile is null rather than the raw pace when a race
// can't be rated: a coach comparing two races needs to know one of them
// is unadjusted, not silently read a raw number as a corrected one.
function computeSeasonAdjustedPaces(results) {
  const contributorsByRace = buildRaceContributors(results);

  return results
    .filter((r) => r.paceSecPerMile > 0)
    .map((r) => {
      const contributors = contributorsByRace.get(r.raceId) || [];
      const { difficultySecPerMile, contributingCount } = averageDelta(contributors, r.athleteId);
      return {
        athleteId: r.athleteId,
        raceId: r.raceId,
        paceSecPerMile: r.paceSecPerMile,
        courseDifficultySecPerMile: difficultySecPerMile,
        adjustedPaceSecPerMile:
          difficultySecPerMile == null ? null : r.paceSecPerMile - difficultySecPerMile,
        contributingCount,
      };
    });
}

// The same correction expressed as a race time rather than a pace, for
// display next to a raw finish time. Only meaningful against another race
// at the SAME distance — an adjusted 5K time and an adjusted mile time are
// no more comparable than the raw ones were.
function adjustedTimeSec(timeSec, adjustedPaceSecPerMile, distanceMeters) {
  if (adjustedPaceSecPerMile == null) return null;
  if (!(timeSec > 0) || !(distanceMeters > 0)) return null;
  return adjustedPaceSecPerMile * (distanceMeters / 1609.34);
}

module.exports.buildRaceContributors = buildRaceContributors;
module.exports.computeSeasonAdjustedPaces = computeSeasonAdjustedPaces;
module.exports.adjustedTimeSec = adjustedTimeSec;
