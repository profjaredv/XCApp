const test = require('node:test');
const assert = require('node:assert/strict');
const { pickTopSevenByPace, computeRaceDifficulty, computeCourseDifficulty } = require('../lib/courseDifficulty');

test('pickTopSevenByPace', async (t) => {
  await t.test('picks the 7 fastest (lowest pace) entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ athleteId: `a${i}`, pace: 400 + i * 10 }));
    const top7 = pickTopSevenByPace(entries);
    assert.equal(top7.length, 7);
    assert.deepEqual(top7.map((e) => e.athleteId), ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });

  await t.test('returns everyone when there are fewer than 7', () => {
    const entries = [{ athleteId: 'a1', pace: 400 }, { athleteId: 'a2', pace: 420 }];
    assert.equal(pickTopSevenByPace(entries).length, 2);
  });

  await t.test('ignores a zero, negative, or missing pace rather than treating it as instant', () => {
    const entries = [
      { athleteId: 'a1', pace: 0 },
      { athleteId: 'a2', pace: -5 },
      { athleteId: 'a3', pace: null },
      { athleteId: 'a4', pace: 400 },
    ];
    const top7 = pickTopSevenByPace(entries);
    assert.deepEqual(top7.map((e) => e.athleteId), ['a4']);
  });
});

test('computeRaceDifficulty', async (t) => {
  await t.test('positive delta when the field ran slower than their own average — a harder course', () => {
    const result = computeRaceDifficulty([
      { athleteId: 'a1', paceAtRace: 420, baselinePace: 400 }, // +20
      { athleteId: 'a2', paceAtRace: 430, baselinePace: 410 }, // +20
    ]);
    assert.equal(result.difficultySecPerMile, 20);
    assert.equal(result.contributingCount, 2);
  });

  await t.test('negative delta when the field ran faster than usual — an easier course', () => {
    const result = computeRaceDifficulty([{ athleteId: 'a1', paceAtRace: 380, baselinePace: 400 }]);
    assert.equal(result.difficultySecPerMile, -20);
  });

  await t.test('an athlete with no baseline (first race of the season) is skipped, not counted as a zero gap', () => {
    const result = computeRaceDifficulty([
      { athleteId: 'a1', paceAtRace: 420, baselinePace: 400 }, // +20
      { athleteId: 'a2', paceAtRace: 500, baselinePace: null }, // no baseline — would drag the average down hard if treated as 0
    ]);
    assert.equal(result.difficultySecPerMile, 20);
    assert.equal(result.contributingCount, 1);
  });

  await t.test('null (not 0 or NaN) when nobody in the field has a baseline — e.g. the team\'s first meet of the season', () => {
    const result = computeRaceDifficulty([{ athleteId: 'a1', paceAtRace: 420, baselinePace: null }]);
    assert.equal(result.difficultySecPerMile, null);
    assert.equal(result.contributingCount, 0);
  });

  await t.test('breakdown reports every entry, including those with no baseline, for transparency', () => {
    const result = computeRaceDifficulty([
      { athleteId: 'a1', paceAtRace: 420, baselinePace: 400 },
      { athleteId: 'a2', paceAtRace: 500, baselinePace: null },
    ]);
    assert.equal(result.breakdown.length, 2);
    assert.equal(result.breakdown[0].deltaSecPerMile, 20);
    assert.equal(result.breakdown[1].deltaSecPerMile, null);
    assert.equal(result.breakdown[1].baselinePace, null);
  });

  await t.test('treats a zero or negative baseline as missing, not a real (impossibly fast) pace', () => {
    const result = computeRaceDifficulty([{ athleteId: 'a1', paceAtRace: 420, baselinePace: 0 }]);
    assert.equal(result.contributingCount, 0);
  });
});

test('computeCourseDifficulty', async (t) => {
  await t.test('weights by contributingCount, not a naive average of each season\'s rating', () => {
    // 2024: 20 sec/mi hard, only 1 runner had a baseline that year.
    // 2023: 10 sec/mi hard, all 7 had a baseline. Should land much
    // closer to 10 than to the midpoint (15).
    const rating = computeCourseDifficulty([
      { difficultySecPerMile: 20, contributingCount: 1 },
      { difficultySecPerMile: 10, contributingCount: 7 },
    ]);
    const expected = (20 * 1 + 10 * 7) / 8;
    assert.ok(Math.abs(rating - expected) < 0.001);
    assert.ok(rating < 15);
  });

  await t.test('ignores a season with no computable rating (nobody had a baseline that year)', () => {
    const rating = computeCourseDifficulty([
      { difficultySecPerMile: null, contributingCount: 0 },
      { difficultySecPerMile: 15, contributingCount: 5 },
    ]);
    assert.equal(rating, 15);
  });

  await t.test('null when no season this course was ever run produced a rating', () => {
    assert.equal(computeCourseDifficulty([{ difficultySecPerMile: null, contributingCount: 0 }]), null);
    assert.equal(computeCourseDifficulty([]), null);
  });
});
