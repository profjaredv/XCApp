const test = require('node:test');
const assert = require('node:assert/strict');
const { anonymizeFieldRows, isTeamRow, teamNameSet } = require('../lib/fieldAnonymize');
const { computeRacePlacements } = require('../lib/fieldPlacement');
const { computeMeetScoring } = require('../lib/meetScoring');
const { computeFieldStats } = require('../lib/fieldNormalization');

const team = [
  { name: 'Aedan Martin', preferredName: null },
  { name: 'Finley Woods-Vallejo', preferredName: 'Finn' },
];

const rows = [
  { athleteName: 'Aedan Martin', schoolName: 'Home HS', grade: 12, gender: 'M', division: 'Boys Varsity', timeSec: 1000, place: 1, status: 'FINISHED' },
  { athleteName: 'Finn Woods-Vallejo', schoolName: 'Home HS', grade: 10, gender: 'M', division: 'Boys Varsity', timeSec: 1010, place: 2, status: 'FINISHED' },
  { athleteName: 'Rival Runner', schoolName: 'Other HS', grade: 11, gender: 'M', division: 'Boys Varsity', timeSec: 1020, place: 3, status: 'FINISHED' },
  { athleteName: 'Another Rival', schoolName: 'Other HS', grade: 9, gender: 'M', division: 'Boys Varsity', timeSec: 1030, place: 4, status: 'DNF' },
];

test('keeps our athletes (by legal or preferred name) and clears everyone else', () => {
  const { rows: out, kept, dropped } = anonymizeFieldRows(rows, team);
  assert.equal(kept, 2);
  assert.equal(dropped, 2);
  assert.deepEqual(out.map((r) => r.athleteName), ['Aedan Martin', 'Finn Woods-Vallejo', null, null]);
  assert.deepEqual(out.map((r) => r.grade), [12, 10, null, null]);
});

test('other schools keep their school, time, place, gender, division and status', () => {
  const { rows: out } = anonymizeFieldRows(rows, team);
  const rival = out[2];
  assert.equal(rival.schoolName, 'Other HS');
  assert.equal(rival.timeSec, 1020);
  assert.equal(rival.place, 3);
  assert.equal(rival.gender, 'M');
  assert.equal(rival.division, 'Boys Varsity');
  assert.equal(out[3].status, 'DNF');
});

test('does not mutate the input rows', () => {
  anonymizeFieldRows(rows, team);
  assert.equal(rows[2].athleteName, 'Rival Runner');
});

test('matching ignores case and spacing, and a blank name is never ours', () => {
  const names = teamNameSet(team);
  assert.equal(isTeamRow({ athleteName: '  aedan   MARTIN ' }, names), true);
  assert.equal(isTeamRow({ athleteName: '' }, names), false);
  assert.equal(isTeamRow({ athleteName: null }, names), false);
});

test('placement, field stats and team scoring still work on anonymized rows', () => {
  const { rows: out } = anonymizeFieldRows(rows, team);
  const fieldResults = out.map((r, i) => ({ id: 'f' + i, raceId: 'r', ...r }));
  const results = [
    { id: 'res1', athleteId: 'a1', athlete: { id: 'a1', name: 'Aedan Martin', preferredName: null, gender: 'M' } },
    { id: 'res2', athleteId: 'a2', athlete: { id: 'a2', name: 'Finley Woods-Vallejo', preferredName: 'Finn', gender: 'M' } },
  ];
  const placements = computeRacePlacements({ results, fieldResults });
  assert.equal(placements.get('res1').place, 1);
  assert.equal(placements.get('res2').place, 2);

  const stats = computeFieldStats(out.filter((r) => r.status === 'FINISHED').map((r) => r.timeSec));
  assert.ok(stats);

  const scoring = computeMeetScoring({ results, fieldResults });
  const div = scoring[0];
  assert.equal(div.fieldSize, 3); // the DNF has no place
  assert.ok(div.scoringTeams.concat(div.incompleteTeams).some((t) => t.schoolName === 'Other HS'));
  assert.ok(div.ourTeamFinishers.every((f) => f.athleteName)); // ours still named
  assert.ok(div.individualTop.some((f) => f.athleteName === null)); // theirs are not
});
