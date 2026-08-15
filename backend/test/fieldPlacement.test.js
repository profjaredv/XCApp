const test = require('node:test');
const assert = require('node:assert/strict');
const { inferRaceGender, computeMeetPlacements } = require('../lib/fieldPlacement');

function fr(id, athleteName, timeSec, place) {
  return { id, athleteName, timeSec, place, status: 'FINISHED' };
}

function result(id, athleteId, athleteName, gender) {
  return { id, athlete: { id: athleteId, name: athleteName, gender } };
}

test('inferRaceGender: majority wins, ties and empty are null', () => {
  assert.equal(inferRaceGender([result('r1', 'a1', 'Jane Doe', 'F'), result('r2', 'a2', 'Sam Lee', 'F')]), 'F');
  assert.equal(inferRaceGender([result('r1', 'a1', 'Jane Doe', 'F'), result('r2', 'a2', 'Sam Lee', 'M')]), null);
  assert.equal(inferRaceGender([]), null);
});

test('computeMeetPlacements: single race gets race place, no overall (only one heat)', () => {
  const race = {
    id: 'race1',
    distance: '5,000 Meters',
    fieldResults: [fr('f1', 'Jane Doe', 1112.4, 3), fr('f2', 'Sam Lee', 1141, 5), fr('f3', 'Pat Rivera', 1200, 8)],
    results: [result('r1', 'a1', 'Jane Doe', 'F')],
  };

  const placements = computeMeetPlacements([race]);
  assert.deepEqual(placements.get('r1'), { place: 3, overallPlace: null, overallFieldSize: null });
});

test('computeMeetPlacements: no name match leaves the result unset', () => {
  const race = {
    id: 'race1',
    distance: '5,000 Meters',
    fieldResults: [fr('f1', 'Someone Else', 1112.4, 3)],
    results: [result('r1', 'a1', 'Jane Doe', 'F')],
  };

  const placements = computeMeetPlacements([race]);
  assert.equal(placements.has('r1'), false);
});

test('computeMeetPlacements: two same-distance same-gender heats combine for overall place', () => {
  // Gold heat: our athlete "Mana Voss" runs 15:23.1, 1st in Gold.
  // Silver heat: our athlete "Theo Park" runs 15:40.0, 1st in Silver — but
  // slower than everyone in Gold, so combined he's actually 2nd overall
  // behind Mana (Gold's 2nd-place finisher below is even slower, so he's
  // not last).
  const gold = {
    id: 'gold',
    distance: '5,000 Meters',
    fieldResults: [fr('g1', 'Mana Voss', 923.1, 1), fr('g2', 'Someone Faster Elsewhere', 950, 2)],
    results: [result('rg1', 'a1', 'Mana Voss', 'M')],
  };
  const silver = {
    id: 'silver',
    distance: '5,000 Meters',
    fieldResults: [fr('s1', 'Theo Park', 940, 1), fr('s2', 'Another Silver Runner', 999, 2)],
    results: [result('rs1', 'a2', 'Theo Park', 'M')],
  };

  const placements = computeMeetPlacements([gold, silver]);

  // Combined sorted by time: Mana Voss (923.1), Theo Park (940), Someone
  // Faster Elsewhere (950), Another Silver Runner (999).
  assert.deepEqual(placements.get('rg1'), { place: 1, overallPlace: 1, overallFieldSize: 4 });
  assert.deepEqual(placements.get('rs1'), { place: 1, overallPlace: 2, overallFieldSize: 4 });
});

test('computeMeetPlacements: different gender races never combine', () => {
  const boys = {
    id: 'boys',
    distance: '5,000 Meters',
    fieldResults: [fr('b1', 'Elias Manthey', 370.2, 1)],
    results: [result('rb1', 'a1', 'Elias Manthey', 'M')],
  };
  const girls = {
    id: 'girls',
    distance: '5,000 Meters',
    fieldResults: [fr('gi1', 'Haunalei Ninnis', 446.3, 1)],
    results: [result('rgi1', 'a2', 'Haunalei Ninnis', 'F')],
  };

  const placements = computeMeetPlacements([boys, girls]);
  assert.deepEqual(placements.get('rb1'), { place: 1, overallPlace: null, overallFieldSize: null });
  assert.deepEqual(placements.get('rgi1'), { place: 1, overallPlace: null, overallFieldSize: null });
});

test('computeMeetPlacements: different distances never combine even with same gender', () => {
  const fiveK = {
    id: 'fivek',
    distance: '5,000 Meters',
    fieldResults: [fr('f1', 'Elias Manthey', 370.2, 1)],
    results: [result('rf1', 'a1', 'Elias Manthey', 'M')],
  };
  const mile = {
    id: 'mile',
    distance: '1 Miles',
    fieldResults: [fr('m1', 'Wendell Stevick', 394.8, 1)],
    results: [result('rm1', 'a2', 'Wendell Stevick', 'M')],
  };

  const placements = computeMeetPlacements([fiveK, mile]);
  assert.equal(placements.get('rf1').overallPlace, null);
  assert.equal(placements.get('rm1').overallPlace, null);
});

test('computeMeetPlacements: unfinished field rows never rank or get matched', () => {
  const race = {
    id: 'race1',
    distance: '5,000 Meters',
    fieldResults: [
      fr('f1', 'Jane Doe', 1112.4, 3),
      { id: 'f2', athleteName: 'Pat Rivera', timeSec: null, place: null, status: 'DNF' },
    ],
    results: [result('r1', 'a1', 'Jane Doe', 'F'), result('r2', 'a2', 'Pat Rivera', 'F')],
  };

  const placements = computeMeetPlacements([race]);
  assert.deepEqual(placements.get('r1'), { place: 3, overallPlace: null, overallFieldSize: null });
  assert.equal(placements.has('r2'), false);
});
