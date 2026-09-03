// The strategy session: "where are the next 20 seconds?"
//
// This is the file where a plausible-looking invention would do the most
// damage — an athlete is going to change how they race because of it. So
// the tests are mostly about what it refuses to claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStrategy,
  bestVsTypical,
  pacingCeiling,
  buildRacePlan,
  MIN_RACES_FOR_TYPICAL,
  NOISE_SEC_PER_MILE,
} = require('../lib/raceStrategy');

const FIVE_K = 5000;
const MILE = 1609.34;
const paceOf = (timeSec) => timeSec / (FIVE_K / MILE);

function race(name, timeSec, date = '2025-09-06') {
  return { raceId: name, raceName: name, date, timeSec, distanceMeters: FIVE_K, paceSecPerMile: paceOf(timeSec) };
}

function splitAgg(paces, raceCount = 3) {
  return {
    raceCount,
    segmentAverages: paces.map((pace, i) => ({
      position: i + 1,
      label: `Mile ${i + 1}`,
      avgSegmentSec: pace,
      avgPaceSecPerMile: pace,
    })),
    pattern: { predominant: 'positive' },
  };
}

test('the best-race lever is a time they have actually run', () => {
  const races = [race('A', 1300), race('B', 1250), race('C', 1200, '2025-10-01')];
  const lever = bestVsTypical(races, FIVE_K);
  assert.equal(lever.confidence, 'measured');
  assert.equal(lever.evidence.bestRace, 'C');
  // Median 1250 vs best 1200 = 50 seconds over the distance.
  assert.ok(Math.abs(lever.seconds - 50) <= 1);
});

test('two races are not a typical race', () => {
  assert.equal(MIN_RACES_FOR_TYPICAL, 3);
  assert.equal(bestVsTypical([race('A', 1300), race('B', 1200)], FIVE_K), null);
});

test('a best that is barely better than typical is not a lever', () => {
  // Noise on a different course in different weather.
  const races = [race('A', 1200), race('B', 1202), race('C', 1204)];
  assert.equal(bestVsTypical(races, FIVE_K), null);
});

test('the pacing number is flagged as the size of the problem, not a plan', () => {
  // Nobody holds mile-one pace to the finish. Reporting this as an
  // achievable saving would have an athlete plan a race around it.
  const lever = pacingCeiling(splitAgg([360, 380, 400]));
  assert.equal(lever.confidence, 'ceiling');
  assert.match(lever.detail, /size of the problem, not the plan/);
  assert.match(lever.detail, /go out at goal pace/i);
});

test('even pacing is reported as nothing to reclaim, not omitted', () => {
  // Silence would let an athlete assume their pacing is the problem.
  const lever = pacingCeiling(splitAgg([380, 381, 382]));
  assert.equal(lever.seconds, 0);
  assert.match(lever.title, /same speed/);
  assert.match(lever.detail, /good pacing/i);
});

test('no splits means no pacing lever at all, and a stated gap', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: null,
    distanceMeters: FIVE_K,
  });
  assert.equal(strategy.levers.find((l) => l.id === 'pacing'), undefined);
  assert.ok(strategy.gaps.some((g) => g.id === 'gap-splits'));
});

test('only measured levers count toward the goal', () => {
  // A ceiling is not seconds in the bank; adding it would turn an honest
  // answer into a promise.
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: splitAgg([360, 380, 400]),
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  assert.ok(strategy.ceilingTotalSec > 0);
  const measuredSum = strategy.levers
    .filter((l) => l.confidence === 'measured')
    .reduce((sum, l) => sum + l.seconds, 0);
  assert.equal(strategy.measuredTotalSec, measuredSum);
  assert.ok(strategy.measuredTotalSec < strategy.measuredTotalSec + strategy.ceilingTotalSec);
});

test('within reach means their own range already covers the goal', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: null,
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  assert.equal(strategy.withinReach, true, '50 seconds of range covers a 20 second goal');

  const tight = buildStrategy({
    races: [race('A', 1204), race('B', 1202), race('C', 1200)],
    splitAggregate: null,
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  assert.equal(tight.withinReach, false);
});

test('the target time is computed off their best, not their typical', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: null,
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  assert.equal(strategy.bestTimeSec, 1200);
  assert.equal(strategy.targetTimeSec, 1180);
  assert.equal(strategy.targetTimeLabel, '19:40');
});

test('nothing predicts a future time', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300, '2025-09-01'), race('B', 1250, '2025-09-15'), race('C', 1200, '2025-10-01')],
    splitAggregate: splitAgg([360, 380, 400]),
    distanceMeters: FIVE_K,
  });
  const prose = [...strategy.levers, ...strategy.gaps].map((l) => `${l.title} ${l.detail}`).join(' ');
  for (const word of ['will run', 'projected', 'predict', 'expect to', 'guaranteed']) {
    assert.ok(!new RegExp(word, 'i').test(prose), `strategy must not forecast: found "${word}"`);
  }
});

test('an athlete with no races gets gaps, not an empty screen', () => {
  const strategy = buildStrategy({ races: [], splitAggregate: null, targetSec: 20 });
  assert.deepEqual(strategy.levers, []);
  assert.ok(strategy.gaps.length > 0);
  assert.equal(strategy.bestTimeSec, null);
});

test('the noise floor is shared, so one race being 2s different is never a finding', () => {
  assert.equal(NOISE_SEC_PER_MILE, 3);
});

// ---------------------------------------------------------------------------
// The race plan, and the language it is written in.
//
// Everything above this line is about not lying. Everything below is about
// being understood by a sixteen-year-old holding a phone the week of a
// race — a true finding they cannot act on is not much better than a wrong
// one.
// ---------------------------------------------------------------------------

test('a mile race is planned in 400s, a 5K in miles', () => {
  // The marks an athlete actually hears called out.
  const mile = buildRacePlan(294, 1600);
  assert.deepEqual(mile.splits.map((s) => s.label), ['400m', '800m', '1200m', 'Finish']);

  const fiveK = buildRacePlan(1200, 5000);
  assert.deepEqual(fiveK.splits.map((s) => s.label), ['Mile 1', 'Mile 2', 'Mile 3', 'Finish']);
});

test('the splits are even and add up to the goal', () => {
  // Even pace and nothing else: any other shape would be a coaching
  // opinion dressed up as this athlete's own data.
  const plan = buildRacePlan(296, 1600);
  const [first, second, third, finish] = plan.splits;
  assert.ok(Math.abs(first.cumulativeSec - 74) < 0.5);
  assert.ok(Math.abs(second.cumulativeSec - 148) < 0.5);
  assert.ok(Math.abs(third.cumulativeSec - 222) < 0.5);
  assert.equal(finish.cumulativeSec, 296);
  const segments = plan.splits.map((s) => s.segmentSec);
  assert.ok(Math.max(...segments) - Math.min(...segments) < 1, 'every segment is the same');
});

test('the race-day instruction names the first split to hit', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: splitAgg([360, 400]),
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  assert.match(strategy.instruction, /Hit \d+:\d\d at the first mark, not faster/);
});

test('with no splits, the instruction is to go and get some', () => {
  const strategy = buildStrategy({
    races: [race('A', 1300), race('B', 1250), race('C', 1200)],
    splitAggregate: null,
    distanceMeters: FIVE_K,
  });
  assert.match(strategy.instruction, /call out your time/i);
});

test('nothing an athlete reads is written in jargon', () => {
  // The words that made the first version of this screen unreadable. A
  // finding nobody can act on is barely worth computing.
  const strategy = buildStrategy({
    races: [race('A', 1300, '2025-09-01'), race('B', 1250, '2025-09-15'), race('C', 1200, '2025-10-01')],
    splitAggregate: splitAgg([360, 380, 400]),
    distanceMeters: FIVE_K,
    targetSec: 20,
  });
  const prose = [...strategy.levers, ...strategy.gaps]
    .map((l) => `${l.title} ${l.detail}`)
    .concat(strategy.instruction)
    .join(' ');
  for (const jargon of ['s/mi', 'arithmetic', 'lever', 'execution', 'median', 'coefficient', 'metric']) {
    assert.ok(!new RegExp(jargon, 'i').test(prose), `copy should not say "${jargon}"`);
  }
});

test('a finding worth seconds says how many, in the title', () => {
  // "You slow down 36 seconds a mile" beats "Pacing analysis" — the title
  // is often the only line that gets read. Findings with no number to give
  // (even pacing, say) are exempt, which is why this checks the ones that
  // do rather than claiming every title has a digit in it.
  const strategy = buildStrategy({
    races: [race('A', 1300, '2025-09-01'), race('B', 1250, '2025-09-15'), race('C', 1200, '2025-10-01')],
    splitAggregate: splitAgg([360, 380, 400]),
    distanceMeters: FIVE_K,
  });
  const numeric = strategy.levers.filter((l) => l.seconds != null && l.seconds > 0);
  assert.ok(numeric.length > 0, 'the fixture produces findings worth seconds');
  for (const lever of numeric) {
    assert.match(lever.title, /\d/, `"${lever.title}" has no number in it`);
  }
});
