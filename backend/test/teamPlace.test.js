const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTeamPlaces } = require('../lib/teamPlace');

function result(id, time, gender, status = 'FINISHED') {
  return { id, time, status, athlete: { gender } };
}

test('computeTeamPlaces: ranks by time within gender, separately per gender', () => {
  const results = [
    result('boy-slow', 1200, 'M'),
    result('boy-fast', 1000, 'M'),
    result('girl-fast', 1100, 'F'),
    result('girl-slow', 1300, 'F'),
  ];

  const places = computeTeamPlaces(results);
  assert.equal(places.get('boy-fast'), 1);
  assert.equal(places.get('boy-slow'), 2);
  assert.equal(places.get('girl-fast'), 1);
  assert.equal(places.get('girl-slow'), 2);
});

test('computeTeamPlaces: excludes DNF/DNS/DQ and missing-time results', () => {
  const results = [
    result('a', 1000, 'M'),
    result('b', null, 'M', 'DNF'),
    result('c', null, 'M', 'DNS'),
  ];

  const places = computeTeamPlaces(results);
  assert.equal(places.get('a'), 1);
  assert.equal(places.has('b'), false);
  assert.equal(places.has('c'), false);
});

test('computeTeamPlaces: results with no gender still rank together, not dropped', () => {
  const results = [result('a', 1100, null), result('b', 1000, undefined)];
  const places = computeTeamPlaces(results);
  assert.equal(places.get('b'), 1);
  assert.equal(places.get('a'), 2);
});

test('computeTeamPlaces: empty input returns an empty map', () => {
  assert.equal(computeTeamPlaces([]).size, 0);
  assert.equal(computeTeamPlaces(undefined).size, 0);
});
