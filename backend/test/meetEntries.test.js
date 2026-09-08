const test = require('node:test');
const assert = require('node:assert/strict');
const { seasonBestSec, decideEntryCapWarning, DEFAULT_ENTRY_CAP, groupEntrantsByRace } = require('../lib/meetEntries');

test('seasonBestSec', async (t) => {
  await t.test('picks the lowest positive time', () => {
    assert.equal(seasonBestSec([{ time: 1200 }, { time: 1100 }, { time: 1300 }]), 1100);
  });

  await t.test('ignores null/zero/negative times rather than treating them as a fast result', () => {
    assert.equal(seasonBestSec([{ time: null }, { time: 0 }, { time: -5 }, { time: 1150 }]), 1150);
  });

  await t.test('returns null when there is no valid result yet, not zero', () => {
    assert.equal(seasonBestSec([]), null);
    assert.equal(seasonBestSec([{ time: null }]), null);
  });
});

test('decideEntryCapWarning', async (t) => {
  await t.test('no warning at or below the cap', () => {
    assert.equal(decideEntryCapWarning(7), false);
    assert.equal(decideEntryCapWarning(0), false);
  });

  await t.test('warns once the entered count exceeds the cap', () => {
    assert.equal(decideEntryCapWarning(8), true);
  });

  await t.test('the default cap is 7, matching the doc\'s "most meets limit varsity to seven"', () => {
    assert.equal(DEFAULT_ENTRY_CAP, 7);
  });

  await t.test('accepts a custom cap for non-varsity races', () => {
    assert.equal(decideEntryCapWarning(10, 12), false);
    assert.equal(decideEntryCapWarning(13, 12), true);
  });
});

// GET /:meetId/entrants — "who's not entered anywhere at this meet yet"
// needs every race's entrants at once, not one request per race.
test('groupEntrantsByRace', async (t) => {
  const races = [
    { id: 'r1', name: 'Varsity Boys' },
    { id: 'r2', name: 'Varsity Girls' },
  ];

  await t.test('sorts each race\'s own entrants by name', () => {
    const entries = [
      { raceId: 'r1', athleteId: 'a1', name: 'Zoe', gender: 'F' },
      { raceId: 'r1', athleteId: 'a2', name: 'Amir', gender: 'M' },
    ];
    const result = groupEntrantsByRace(races, entries);
    assert.deepEqual(result[0].entrants.map((e) => e.name), ['Amir', 'Zoe']);
  });

  await t.test('never omits a race just because nobody is entered in it yet', () => {
    const result = groupEntrantsByRace(races, []);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0].entrants, []);
    assert.deepEqual(result[1].entrants, []);
  });

  await t.test('keeps races distinct — an entrant in one never leaks into another', () => {
    const entries = [{ raceId: 'r1', athleteId: 'a1', name: 'Amir', gender: 'M' }];
    const result = groupEntrantsByRace(races, entries);
    assert.equal(result.find((r) => r.id === 'r1').entrants.length, 1);
    assert.equal(result.find((r) => r.id === 'r2').entrants.length, 0);
  });

  await t.test('ignores an entry for a race outside this meet rather than throwing', () => {
    const entries = [{ raceId: 'not-in-this-meet', athleteId: 'a1', name: 'Amir', gender: 'M' }];
    assert.doesNotThrow(() => groupEntrantsByRace(races, entries));
  });
});
