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
