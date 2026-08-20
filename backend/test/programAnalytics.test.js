const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAttritionCurve } = require('../lib/programAnalytics');

// This sandbox has no DATABASE_URL — these tests exercise the pure
// retention-curve function routes/programAnalytics.js calls, against
// constructed roster fixtures, same approach as test/bandAnalytics.test.js.

function row(athleteId, year, grade) {
  return { athleteId, year, grade };
}

test('a fully-retained cohort shows 100% retention at every observable window', () => {
  // 3 athletes, grade null (no graduation guard), rostered every year
  // 2022..2026 (5 seasons -> max window fully observable is 4).
  const rows = [];
  for (const athleteId of ['a', 'b', 'c']) {
    for (let year = 2022; year <= 2026; year++) rows.push(row(athleteId, year, null));
  }

  const result = computeAttritionCurve(rows, [1, 2, 3, 4]);

  assert.deepEqual(result.retention, { 1: 100, 2: 100, 3: 100, 4: 100 });
  // Every athlete's first year is 2022, so every window (target year
  // 2023..2026) is observable against maxYear 2026.
  assert.deepEqual(result.cohortSizes, { 1: 3, 2: 3, 3: 3, 4: 3 });
});

test('an athlete who leaves after their first season lowers 1-year retention but not later windows they were never eligible for', () => {
  const rows = [
    row('stays', 2024, null),
    row('stays', 2025, null),
    row('leaves', 2024, null), // never seen again
  ];

  const result = computeAttritionCurve(rows, [1, 2]);

  // Window 1: target year 2025 <= maxYear 2025 -> both athletes eligible.
  // "stays" retained, "leaves" not -> 1/2 = 50%.
  assert.equal(result.retention[1], 50);
  assert.equal(result.cohortSizes[1], 2);

  // Window 2: target year 2026 > maxYear 2025 -> nobody's window is
  // observable yet, so this is null (not zero, not fabricated).
  assert.equal(result.retention[2], null);
  assert.equal(result.cohortSizes[2], 0);
});

test('a senior is excluded from a window once they would have already graduated, not counted as attrition', () => {
  const rows = [
    row('senior', 2024, 12), // grade 12 in 2024 -> graduates after this season
    row('sophomore', 2024, 10),
    row('sophomore', 2025, 11), // still on the team a year later
  ];

  const result = computeAttritionCurve(rows, [1]);

  // "senior" is excluded from the window-1 denominator entirely (12 - 12
  // = 0 years left, so window 1 already exceeds their remaining
  // eligibility) — only "sophomore" counts, and they're retained.
  assert.equal(result.cohortSizes[1], 1);
  assert.equal(result.retention[1], 100);
});

test('empty input returns null retention for every window rather than dividing by zero', () => {
  const result = computeAttritionCurve([], [1, 2, 3, 4]);
  assert.deepEqual(result.retention, { 1: null, 2: null, 3: null, 4: null });
  assert.deepEqual(result.cohortSizes, { 1: 0, 2: 0, 3: 0, 4: 0 });
});
