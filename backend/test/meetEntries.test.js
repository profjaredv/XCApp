const test = require('node:test');
const assert = require('node:assert/strict');
const { seasonBestSec, decideEntryCapWarning, DEFAULT_ENTRY_CAP } = require('../lib/meetEntries');

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
