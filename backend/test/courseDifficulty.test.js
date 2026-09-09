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

// --- Course-ADJUSTED paces -------------------------------------------
const { buildRaceContributors, computeSeasonAdjustedPaces, adjustedTimeSec } = require('../lib/courseDifficulty');

// Builds a season where every athlete runs every race, each course adds a
// fixed number of sec/mile, and each athlete has a fixed fitness — so the
// correct adjusted pace is knowable exactly and any leftover course
// signal is a bug, not noise.
function season({ courseEffects, fitness, overrides = {} }) {
  const results = [];
  for (const [athleteId, base] of Object.entries(fitness)) {
    for (const [raceId, effect] of Object.entries(courseEffects)) {
      const key = `${athleteId}@${raceId}`;
      results.push({
        athleteId,
        raceId,
        paceSecPerMile: key in overrides ? overrides[key] : base + effect,
      });
    }
  }
  return results;
}

test('computeSeasonAdjustedPaces', async (t) => {
  await t.test("the coach's two time trials: 6:00 on a track then 6:20 on a hill reads as an improvement, not a 20-second regression", () => {
    // One mile on a track, one mile up a hill that costs the team 25
    // sec/mile. Our runner goes 360 then 380 — 20 slower, but 5 seconds
    // BETTER than the hill should have cost him.
    const fitness = { x: 360, b: 370, c: 380, d: 390, e: 400, f: 410, g: 420 };
    const results = season({
      courseEffects: { track: 0, hill: 25 },
      fitness,
      overrides: { 'x@hill': 380 }, // 360 + 25 would be 385; he ran 380.
    });

    const rows = computeSeasonAdjustedPaces(results);
    const xTrack = rows.find((r) => r.athleteId === 'x' && r.raceId === 'track');
    const xHill = rows.find((r) => r.athleteId === 'x' && r.raceId === 'hill');

    // Raw times say he lost 20 seconds.
    assert.equal(xHill.paceSecPerMile - xTrack.paceSecPerMile, 20);

    // Adjusted, he gained 5 — the real number.
    const gain = xTrack.adjustedPaceSecPerMile - xHill.adjustedPaceSecPerMile;
    assert.ok(Math.abs(gain - 5) < 1e-9, `expected a 5 sec/mi improvement, got ${gain}`);
  });

  await t.test('shrinks each gap by (n-1)/n so a two-race season is not rated at double scale', () => {
    // Without the correction a 2-race season reports the full pairwise
    // gap (25) as each course's rating instead of the ±12.5 deviation
    // from the season's average course, and every adjustment doubles.
    const results = season({
      courseEffects: { track: 0, hill: 25 },
      fitness: { a: 360, b: 370, c: 380 },
    });
    const rows = computeSeasonAdjustedPaces(results);
    const hill = rows.find((r) => r.athleteId === 'a' && r.raceId === 'hill');
    const track = rows.find((r) => r.athleteId === 'a' && r.raceId === 'track');

    assert.ok(Math.abs(hill.courseDifficultySecPerMile - 12.5) < 1e-9);
    assert.ok(Math.abs(track.courseDifficultySecPerMile - -12.5) < 1e-9);
  });

  await t.test('a runner who held exactly steady across wildly different courses shows a flat adjusted line', () => {
    const results = season({
      courseEffects: { flat: 0, hill: 30, mud: 45, fast: -10 },
      fitness: { a: 360, b: 375, c: 390 },
    });
    const rows = computeSeasonAdjustedPaces(results).filter((r) => r.athleteId === 'a');
    const adjusted = rows.map((r) => r.adjustedPaceSecPerMile);
    for (const v of adjusted) {
      assert.ok(Math.abs(v - adjusted[0]) < 1e-9, `adjusted paces drifted: ${adjusted.join(', ')}`);
    }
    // Raw paces were anything but flat.
    assert.notEqual(rows[0].paceSecPerMile, rows[2].paceSecPerMile);
  });

  await t.test("leaves the athlete being adjusted out of his own rating, so a bad day doesn't excuse itself", () => {
    const results = season({
      courseEffects: { one: 0, two: 20 },
      fitness: { a: 360, b: 370, c: 380 },
      overrides: { 'a@two': 460 }, // blew up: 80 sec/mi worse than the course explains
    });
    const rows = computeSeasonAdjustedPaces(results);
    const a = rows.find((r) => r.athleteId === 'a' && r.raceId === 'two');
    const b = rows.find((r) => r.athleteId === 'b' && r.raceId === 'two');

    // The course really is 20 harder, i.e. 10 above this two-race
    // season's average. a's rating is exactly that, built from b and c
    // alone — his own 80-second blowup never reaches the number he is
    // then measured against.
    assert.ok(Math.abs(a.courseDifficultySecPerMile - 10) < 1e-9);
    // b, whose rating DOES include a, gets dragged well past the truth —
    // which is the whole reason a is left out of his own.
    assert.ok(b.courseDifficultySecPerMile > 25);
    // And the blowup survives adjustment as a real regression.
    const aOne = rows.find((r) => r.athleteId === 'a' && r.raceId === 'one');
    assert.ok(a.adjustedPaceSecPerMile - aOne.adjustedPaceSecPerMile > 50);
  });

  await t.test('reports no adjustment rather than a raw pace when a race has no comparable runners', () => {
    // Everyone's only race of the season: nothing has a baseline.
    const results = [
      { athleteId: 'a', raceId: 'solo', paceSecPerMile: 400 },
      { athleteId: 'b', raceId: 'solo', paceSecPerMile: 410 },
    ];
    const rows = computeSeasonAdjustedPaces(results);
    for (const r of rows) {
      assert.equal(r.courseDifficultySecPerMile, null);
      assert.equal(r.adjustedPaceSecPerMile, null);
      assert.equal(r.contributingCount, 0);
    }
  });

  await t.test("adjusts a first-time racer off his teammates' rating even though he has no baseline of his own", () => {
    const results = season({ courseEffects: { one: 0, two: 20 }, fitness: { a: 360, b: 370 } });
    results.push({ athleteId: 'newbie', raceId: 'two', paceSecPerMile: 500 });

    const rows = computeSeasonAdjustedPaces(results);
    const n = rows.find((r) => r.athleteId === 'newbie');
    assert.notEqual(n.adjustedPaceSecPerMile, null);
    assert.ok(n.contributingCount > 0);
  });

  await t.test('drops a non-finish (zero or missing pace) instead of rating the course off it', () => {
    const results = season({ courseEffects: { one: 0, two: 20 }, fitness: { a: 360, b: 370 } });
    results.push({ athleteId: 'dnf', raceId: 'two', paceSecPerMile: 0 });

    const rows = computeSeasonAdjustedPaces(results);
    assert.equal(rows.filter((r) => r.athleteId === 'dnf').length, 0);
  });

  await t.test('rates a race off its top 7 only, not a slow tail that would make every course look hard', () => {
    const fitness = {};
    for (let i = 0; i < 12; i += 1) fitness[`a${i}`] = 360 + i * 10;
    const results = season({ courseEffects: { one: 0, two: 20 }, fitness });

    const contributors = buildRaceContributors(results).get('two');
    assert.equal(contributors.length, 7);
    assert.deepEqual(contributors.map((c) => c.athleteId), ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });
});

test('adjustedTimeSec', async (t) => {
  await t.test('turns an adjusted pace back into a race time at that distance', () => {
    // A 5K at 6:00/mile adjusted pace.
    const t5k = adjustedTimeSec(1200, 360, 5000);
    assert.ok(Math.abs(t5k - 360 * (5000 / 1609.34)) < 1e-9);
  });

  await t.test('stays null when there was no adjustment to apply', () => {
    assert.equal(adjustedTimeSec(1200, null, 5000), null);
    assert.equal(adjustedTimeSec(0, 360, 5000), null);
    assert.equal(adjustedTimeSec(1200, 360, 0), null);
  });
});
