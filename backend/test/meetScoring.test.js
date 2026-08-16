const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDivisionScoring, computeMeetScoring } = require('../lib/meetScoring');

function fr(id, athleteName, schoolName, division, gender, place, timeSec = place * 60) {
  return { id, athleteName, schoolName, division, gender, place, timeSec, status: 'FINISHED' };
}

function result(id, athleteId, athleteName, gender) {
  return { id, athlete: { id: athleteId, name: athleteName, gender } };
}

test('computeDivisionScoring: a clean dual meet — lower total wins', () => {
  // Home team places 1,3,5,7,9 = 25; Away team places 2,4,6,8,10 = 30.
  const rows = [
    fr('h1', 'Home A', 'Home', 'Boys Varsity', 'M', 1),
    fr('a1', 'Away A', 'Away', 'Boys Varsity', 'M', 2),
    fr('h2', 'Home B', 'Home', 'Boys Varsity', 'M', 3),
    fr('a2', 'Away B', 'Away', 'Boys Varsity', 'M', 4),
    fr('h3', 'Home C', 'Home', 'Boys Varsity', 'M', 5),
    fr('a3', 'Away C', 'Away', 'Boys Varsity', 'M', 6),
    fr('h4', 'Home D', 'Home', 'Boys Varsity', 'M', 7),
    fr('a4', 'Away D', 'Away', 'Boys Varsity', 'M', 8),
    fr('h5', 'Home E', 'Home', 'Boys Varsity', 'M', 9),
    fr('a5', 'Away E', 'Away', 'Boys Varsity', 'M', 10),
  ];

  const { scoringTeams, incompleteTeams } = computeDivisionScoring(rows);

  assert.equal(incompleteTeams.length, 0);
  assert.equal(scoringTeams.length, 2);
  assert.equal(scoringTeams[0].schoolName, 'Home');
  assert.equal(scoringTeams[0].score, 25);
  assert.equal(scoringTeams[0].rank, 1);
  assert.equal(scoringTeams[1].schoolName, 'Away');
  assert.equal(scoringTeams[1].score, 30);
  assert.equal(scoringTeams[1].rank, 2);
});

test('computeDivisionScoring: a team with fewer than 5 finishers cannot score', () => {
  const rows = [
    fr('h1', 'Home A', 'Home', 'Boys Varsity', 'M', 1),
    fr('h2', 'Home B', 'Home', 'Boys Varsity', 'M', 2),
    fr('h3', 'Home C', 'Home', 'Boys Varsity', 'M', 3),
    fr('h4', 'Home D', 'Home', 'Boys Varsity', 'M', 4),
    // Only 4 finishers for Home — no 5th scorer.
    fr('a1', 'Away A', 'Away', 'Boys Varsity', 'M', 5),
    fr('a2', 'Away B', 'Away', 'Boys Varsity', 'M', 6),
    fr('a3', 'Away C', 'Away', 'Boys Varsity', 'M', 7),
    fr('a4', 'Away D', 'Away', 'Boys Varsity', 'M', 8),
    fr('a5', 'Away E', 'Away', 'Boys Varsity', 'M', 9),
  ];

  const { scoringTeams, incompleteTeams } = computeDivisionScoring(rows);

  assert.equal(scoringTeams.length, 1);
  assert.equal(scoringTeams[0].schoolName, 'Away');
  assert.equal(incompleteTeams.length, 1);
  assert.equal(incompleteTeams[0].schoolName, 'Home');
  assert.equal(incompleteTeams[0].canScore, false);
  assert.equal(incompleteTeams[0].score, null);
  assert.equal(incompleteTeams[0].finisherCount, 4);
});

test('computeDivisionScoring: ties break on the 5th scorer\'s place', () => {
  // Home = {1,4,5,6,9} = 25 (5th-counted scorer placed 9th); Away =
  // {2,3,7,8,5} = 25 (5th-counted scorer placed 8th) — same total, Away
  // wins the tiebreak since its last scorer placed better.
  const clean = [
    fr('h1', 'Home A', 'Home', 'X', 'M', 1),
    fr('h2', 'Home B', 'Home', 'X', 'M', 4),
    fr('h3', 'Home C', 'Home', 'X', 'M', 5),
    fr('h4', 'Home D', 'Home', 'X', 'M', 6),
    fr('h5', 'Home E', 'Home', 'X', 'M', 9), // Home: 25, 5th-place = 9
    fr('a1', 'Away A', 'Away', 'X', 'M', 2),
    fr('a2', 'Away B', 'Away', 'X', 'M', 3),
    fr('a3', 'Away C', 'Away', 'X', 'M', 7),
    fr('a4', 'Away D', 'Away', 'X', 'M', 8),
    fr('a5', 'Away E', 'Away', 'X', 'M', 5), // Away: 2+3+7+8+5 = 25, 5th-place = 8
  ];

  const { scoringTeams } = computeDivisionScoring(clean);
  assert.equal(scoringTeams[0].score, 25);
  assert.equal(scoringTeams[1].score, 25);
  // Away's 5th-counted scorer placed 8th, Home's placed 9th — Away wins the tie.
  assert.equal(scoringTeams[0].schoolName, 'Away');
  assert.equal(scoringTeams[1].schoolName, 'Home');
});

test('computeDivisionScoring: a row with no schoolName occupies its place but scores no team', () => {
  const rows = [
    fr('u1', 'Unattached Runner', null, 'X', 'M', 1),
    fr('h1', 'Home A', 'Home', 'X', 'M', 2),
    fr('h2', 'Home B', 'Home', 'X', 'M', 3),
    fr('h3', 'Home C', 'Home', 'X', 'M', 4),
    fr('h4', 'Home D', 'Home', 'X', 'M', 5),
    fr('h5', 'Home E', 'Home', 'X', 'M', 6), // Home: 2+3+4+5+6 = 20, using real places (not renumbered)
  ];

  const { scoringTeams, individualTop } = computeDivisionScoring(rows);
  assert.equal(scoringTeams.length, 1);
  assert.equal(scoringTeams[0].score, 20);
  assert.equal(individualTop[0].athleteName, 'Unattached Runner');
  assert.equal(individualTop.length, 3);
});

test('computeDivisionScoring: fieldSize counts every row with a known place, not just ours', () => {
  const rows = [
    fr('h1', 'Home A', 'Home', 'X', 'M', 1),
    fr('a1', 'Away A', 'Away', 'X', 'M', 2),
    fr('u1', 'Unattached', null, 'X', 'M', 3),
    { id: 'nop', athleteName: 'No Place', schoolName: 'Home', division: 'X', gender: 'M', place: null, timeSec: 999, status: 'FINISHED' },
  ];
  const { fieldSize } = computeDivisionScoring(rows);
  assert.equal(fieldSize, 3);
});

test('computeDivisionScoring: 6th and 7th finishers are displacers, not scorers', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((place) => fr(`h${place}`, `Home ${place}`, 'Home', 'X', 'M', place));
  const { scoringTeams } = computeDivisionScoring(rows);
  assert.equal(scoringTeams[0].score, 1 + 2 + 3 + 4 + 5);
  assert.equal(scoringTeams[0].scorers.length, 5);
  assert.equal(scoringTeams[0].displacers.length, 2);
  assert.deepEqual(scoringTeams[0].displacers.map((d) => d.place), [6, 7]);
});

test('computeMeetScoring: splits by division and flags our team via matched results', () => {
  const race = {
    fieldResults: [
      fr('h1', 'Home A', 'Home', 'Boys Gold', 'M', 1),
      fr('h2', 'Home B', 'Home', 'Boys Gold', 'M', 3),
      fr('h3', 'Home C', 'Home', 'Boys Gold', 'M', 5),
      fr('h4', 'Home D', 'Home', 'Boys Gold', 'M', 7),
      fr('h5', 'Home E', 'Home', 'Boys Gold', 'M', 9),
      fr('a1', 'Away A', 'Away', 'Boys Gold', 'M', 2),
      fr('a2', 'Away B', 'Away', 'Boys Gold', 'M', 4),
      fr('a3', 'Away C', 'Away', 'Boys Gold', 'M', 6),
      fr('a4', 'Away D', 'Away', 'Boys Gold', 'M', 8),
      fr('a5', 'Away E', 'Away', 'Boys Gold', 'M', 10),
      fr('g1', 'Girl A', 'Home', 'Girls Gold', 'F', 1),
    ],
    results: [
      result('r1', 'ath1', 'Home A', 'M'),
      result('r2', 'ath2', 'Home B', 'M'),
    ],
  };

  const scoring = computeMeetScoring(race);
  assert.equal(scoring.length, 2);

  const boysGold = scoring.find((d) => d.division === 'Boys Gold');
  const homeTeam = boysGold.scoringTeams.find((t) => t.schoolName === 'Home');
  assert.equal(homeTeam.isOurTeam, true);
  const awayTeam = boysGold.scoringTeams.find((t) => t.schoolName === 'Away');
  assert.equal(awayTeam.isOurTeam, false);
  assert.equal(boysGold.ourTeamFinisherCount, 2);

  const girlsGold = scoring.find((d) => d.division === 'Girls Gold');
  assert.equal(girlsGold.incompleteTeams[0].schoolName, 'Home');
});

test('computeMeetScoring: no field results at all returns an empty array', () => {
  const race = { fieldResults: [], results: [] };
  assert.deepEqual(computeMeetScoring(race), []);
});
