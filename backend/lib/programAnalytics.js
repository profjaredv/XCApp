// Program tab (nav "Program" -> BandTrendsPage): pure, DB-free helpers so
// they can be unit-tested against constructed fixtures in this sandbox
// (no DATABASE_URL here — see test/programAnalytics.test.js), same
// approach as lib/bandAnalytics.js.

// Retention/attrition curve, pooled across every cohort the loaded seasons
// can actually observe — with only a handful of seasons on file, a single
// "started 2022" cohort would be too small to mean anything, so instead:
// of every athlete whose *first* rostered season was at least N years
// before the most recent loaded season, what fraction were still rostered
// N years later? Pooling cohorts this way is what makes "attrition after
// 4 years" answerable well before the program has 4 full independent
// cohorts to compare.
//
// Graduating seniors are excluded from a window once they'd have already
// graduated (grade + N > 12) — a senior not returning next year is not
// attrition, and folding those in would inflate every number with normal
// graduation. An athlete with no recorded grade can't be excluded this
// way and is always counted (safer to undercount the exclusion than to
// silently drop someone from the denominator).
//
// @param {Array<{athleteId: string, year: number, grade: number|null}>} rosterRows
//   One row per (athlete, season) the athlete was on an *active* roster —
//   caller filters SeasonRoster.isActive before building this.
// @param {number[]} windows e.g. [1, 2, 3, 4]
function computeAttritionCurve(rosterRows, windows) {
  const byAthlete = new Map();
  let maxYear = -Infinity;
  for (const row of rosterRows) {
    if (row.year > maxYear) maxYear = row.year;
    if (!byAthlete.has(row.athleteId)) byAthlete.set(row.athleteId, []);
    byAthlete.get(row.athleteId).push(row);
  }

  const athletes = [...byAthlete.values()].map((rows) => {
    rows.sort((a, b) => a.year - b.year);
    const first = rows[0];
    return { firstYear: first.year, firstGrade: first.grade, years: new Set(rows.map((r) => r.year)) };
  });

  const retention = {};
  const cohortSizes = {};

  for (const w of windows) {
    let eligible = 0;
    let retained = 0;
    for (const a of athletes) {
      const targetYear = a.firstYear + w;
      if (rosterRows.length === 0 || targetYear > maxYear) continue; // not enough elapsed seasons to observe this window yet
      if (a.firstGrade != null) {
        const yearsUntilGraduation = 12 - a.firstGrade;
        if (w > yearsUntilGraduation) continue; // would already have graduated — not attrition
      }
      eligible++;
      if (a.years.has(targetYear)) retained++;
    }
    cohortSizes[w] = eligible;
    retention[w] = eligible > 0 ? parseFloat(((retained / eligible) * 100).toFixed(1)) : null;
  }

  return { windows, retention, cohortSizes };
}

module.exports = { computeAttritionCurve };
