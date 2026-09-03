// The per-season numbers behind the Program screen. These used to come
// from TeamSeasonMetrics — which only exists for seasons somebody ran
// "Recalculate Metrics" on — so a program's history could sit empty for
// years of real racing. They are computed from results now, and this is
// where that math is checked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeasonShapes, medianBestPace, bestPackSpread, computeChurn, MIN_FOR_MEDIAN } = require('../lib/programSeasons');

const FIVE_K = 5000;

function row(athleteId, timeSec, overrides = {}) {
  return {
    athleteId,
    gender: 'M',
    season: 2025,
    raceId: 'r1',
    raceName: 'Opener',
    date: '2025-09-06',
    timeSec,
    distanceMeters: FIVE_K,
    ...overrides,
  };
}

test('median pace counts each athlete once, at their best race', () => {
  // Season bests, so a season where everyone raced nine times is not
  // weighted differently from one where they raced four.
  const rows = [row('a', 1200), row('a', 1100), row('b', 1300), row('c', 1250)];
  const { paceSecPerMile, athleteCount } = medianBestPace(rows);
  assert.equal(athleteCount, 3);
  const paceOf = (t) => t / (FIVE_K / 1609.34);
  assert.ok(Math.abs(paceSecPerMile - paceOf(1250)) < 0.001, 'the median of 1100/1250/1300');
});

test('median rather than mean, so one transfer does not move the program', () => {
  const withoutStar = medianBestPace([row('a', 1200), row('b', 1220), row('c', 1240)]);
  const withStar = medianBestPace([row('a', 1200), row('b', 1220), row('c', 1240), row('star', 800)]);
  assert.ok(withStar.paceSecPerMile < withoutStar.paceSecPerMile, 'a fourth athlete shifts the median a little');
  const meanShift = (1200 + 1220 + 1240) / 3 - (1200 + 1220 + 1240 + 800) / 4;
  const medianShiftSec = (withoutStar.paceSecPerMile - withStar.paceSecPerMile) * (FIVE_K / 1609.34);
  assert.ok(medianShiftSec < meanShift, 'and much less than a mean would');
});

test('two people are not a median', () => {
  assert.equal(MIN_FOR_MEDIAN, 3);
  assert.equal(medianBestPace([row('a', 1200), row('b', 1220)]).paceSecPerMile, null);
});

test('pack spread is the tightest race of the season, not an average of them', () => {
  // Pack tightness is something a team achieves on a day; averaging it
  // mixes a championship line-up with the meet where half the squad sat.
  const tight = [1200, 1205, 1210, 1215, 1220].map((t, i) => row(`a${i}`, t, { raceId: 'tight', raceName: 'Districts' }));
  const loose = [1200, 1260, 1300, 1340, 1400].map((t, i) => row(`a${i}`, t, { raceId: 'loose', raceName: 'Opener' }));
  const best = bestPackSpread([...tight, ...loose]);
  assert.equal(best.spreadSec, 20);
  assert.equal(best.raceName, 'Districts');
});

test('a race without five finishers cannot produce a pack spread', () => {
  const four = [1200, 1210, 1220, 1230].map((t, i) => row(`a${i}`, t));
  assert.equal(bestPackSpread(four), null);
});

test('the first season on file reports null churn, not 0% returning', () => {
  // Nobody failed to return to a season that is not in the data.
  const churn = computeChurn(new Map([[2024, new Set(['a', 'b'])], [2025, new Set(['a', 'c'])]]));
  assert.deepEqual(churn.get(2024), { returning: null, newcomers: null, previousSize: null, returnRate: null });
  assert.deepEqual(churn.get(2025), { returning: 1, newcomers: 1, previousSize: 2, returnRate: 50 });
});

test('per-athlete counts make two seasons comparable', () => {
  // Nine meets logs more miles than four without anyone running further.
  const long = [];
  for (let raceIndex = 0; raceIndex < 4; raceIndex++) {
    long.push(row('a', 1200, { raceId: `r${raceIndex}`, season: 2025 }));
    long.push(row('b', 1250, { raceId: `r${raceIndex}`, season: 2025 }));
  }
  const short = [row('a', 1200, { raceId: 'x', season: 2024 }), row('b', 1250, { raceId: 'x', season: 2024 })];

  const shapes = buildSeasonShapes([...short, ...long], new Map([[2024, new Set(['a', 'b'])], [2025, new Set(['a', 'b'])]]), [2024, 2025]);
  const [y2024, y2025] = shapes;
  assert.ok(y2025.raceMiles > y2024.raceMiles, 'more meets, more miles');
  assert.equal(y2024.racesPerAthlete, 1);
  assert.equal(y2025.racesPerAthlete, 4);
  assert.equal(y2024.milesPerAthlete, 3.1);
});

test('a season on the roster with no races is reported, not skipped', () => {
  const shapes = buildSeasonShapes([], new Map([[2025, new Set(['a', 'b', 'c'])]]), [2025]);
  assert.equal(shapes[0].meets, 0);
  assert.equal(shapes[0].racedCount, 0);
  assert.equal(shapes[0].racesPerAthlete, null, 'never 0 races per athlete — there were no athletes racing');
});

test('roster and racers are different numbers, and both are reported', () => {
  const shapes = buildSeasonShapes(
    [row('a', 1200), row('b', 1250)],
    new Map([[2025, new Set(['a', 'b', 'c', 'd'])]]),
    [2025]
  );
  assert.equal(shapes[0].racedCount, 2);
  assert.equal(shapes[0].racedShare, 50);
});
