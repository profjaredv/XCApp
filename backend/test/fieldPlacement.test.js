const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRacePlacements } = require('../lib/fieldPlacement');

function fr(id, athleteName, division, gender, timeSec, place) {
  return { id, athleteName, division, gender, timeSec, place, status: 'FINISHED' };
}

function result(id, athleteId, athleteName, gender) {
  return { id, athlete: { id: athleteId, name: athleteName, gender } };
}

test('computeRacePlacements: single division gets place, no overall (nothing to distinguish)', () => {
  const race = {
    id: 'race1',
    fieldResults: [
      fr('f1', 'Jane Doe', '5,000 Meters Girls Varsity', 'F', 1112.4, 3),
      fr('f2', 'Sam Lee', '5,000 Meters Girls Varsity', 'F', 1141, 5),
    ],
    results: [result('r1', 'a1', 'Jane Doe', 'F')],
  };

  const placements = computeRacePlacements(race);
  assert.deepEqual(placements.get('r1'), {
    division: '5,000 Meters Girls Varsity',
    place: 3,
    overallPlace: null,
    overallFieldSize: null,
  });
});

test('computeRacePlacements: no name match leaves the result unset', () => {
  const race = {
    id: 'race1',
    fieldResults: [fr('f1', 'Someone Else', 'Girls Varsity', 'F', 1112.4, 3)],
    results: [result('r1', 'a1', 'Jane Doe', 'F')],
  };

  const placements = computeRacePlacements(race);
  assert.equal(placements.has('r1'), false);
});

test('computeRacePlacements: two divisions of the same gender on one race combine for overall place', () => {
  // Boys Gold Varsity: our athlete "Mana Voss" runs 15:23.1, 1st in Gold.
  // Boys Silver Varsity: our athlete "Theo Park" runs 15:40.0, 1st in
  // Silver — but slower than Gold's other finisher, so combined he's 2nd.
  const race = {
    id: 'race1',
    fieldResults: [
      fr('g1', 'Mana Voss', 'Boys Gold Varsity', 'M', 923.1, 1),
      fr('g2', 'Someone Faster Elsewhere', 'Boys Gold Varsity', 'M', 950, 2),
      fr('s1', 'Theo Park', 'Boys Silver Varsity', 'M', 940, 1),
      fr('s2', 'Another Silver Runner', 'Boys Silver Varsity', 'M', 999, 2),
    ],
    results: [result('rg1', 'a1', 'Mana Voss', 'M'), result('rs1', 'a2', 'Theo Park', 'M')],
  };

  const placements = computeRacePlacements(race);

  // Combined sorted by time: Mana Voss (923.1), Theo Park (940), Someone
  // Faster Elsewhere (950), Another Silver Runner (999).
  assert.deepEqual(placements.get('rg1'), {
    division: 'Boys Gold Varsity',
    place: 1,
    overallPlace: 1,
    overallFieldSize: 4,
  });
  assert.deepEqual(placements.get('rs1'), {
    division: 'Boys Silver Varsity',
    place: 1,
    overallPlace: 2,
    overallFieldSize: 4,
  });
});

test('computeRacePlacements: different genders on the same race never combine', () => {
  const race = {
    id: 'race1',
    fieldResults: [
      fr('b1', 'Elias Manthey', 'Boys Varsity', 'M', 370.2, 1),
      fr('b2', 'Another Boy', 'Boys JV', 'M', 400, 1),
      fr('gi1', 'Haunalei Ninnis', 'Girls Varsity', 'F', 446.3, 1),
      fr('gi2', 'Another Girl', 'Girls JV', 'F', 460, 1),
    ],
    results: [result('rb1', 'a1', 'Elias Manthey', 'M'), result('rgi1', 'a2', 'Haunalei Ninnis', 'F')],
  };

  const placements = computeRacePlacements(race);
  assert.equal(placements.get('rb1').overallPlace, 1);
  assert.equal(placements.get('rb1').overallFieldSize, 2);
  assert.equal(placements.get('rgi1').overallPlace, 1);
  assert.equal(placements.get('rgi1').overallFieldSize, 2);
});

test('computeRacePlacements: rows with no gender recorded are excluded from overall grouping', () => {
  const race = {
    id: 'race1',
    fieldResults: [
      fr('m1', 'Elias Manthey', 'Boys Varsity', 'M', 370.2, 1),
      fr('m2', 'Another Boy', 'Boys JV', 'M', 400, 1),
      fr('u1', 'Unknown Gender Runner', 'Unknown Division', null, 380, 1),
    ],
    results: [result('rm1', 'a1', 'Elias Manthey', 'M'), result('ru1', 'a2', 'Unknown Gender Runner', null)],
  };

  const placements = computeRacePlacements(race);
  assert.equal(placements.get('rm1').overallPlace, 1);
  assert.equal(placements.get('rm1').overallFieldSize, 2);
  // Matched (has a place), but no gender to group into an overall cohort.
  assert.deepEqual(placements.get('ru1'), {
    division: 'Unknown Division',
    place: 1,
    overallPlace: null,
    overallFieldSize: null,
  });
});

test('computeRacePlacements: unfinished field rows never rank or get matched', () => {
  const race = {
    id: 'race1',
    fieldResults: [
      fr('f1', 'Jane Doe', 'Girls Varsity', 'F', 1112.4, 3),
      { id: 'f2', athleteName: 'Pat Rivera', division: 'Girls Varsity', gender: 'F', timeSec: null, place: null, status: 'DNF' },
    ],
    results: [result('r1', 'a1', 'Jane Doe', 'F'), result('r2', 'a2', 'Pat Rivera', 'F')],
  };

  const placements = computeRacePlacements(race);
  assert.deepEqual(placements.get('r1'), {
    division: 'Girls Varsity',
    place: 3,
    overallPlace: null,
    overallFieldSize: null,
  });
  assert.equal(placements.has('r2'), false);
});
