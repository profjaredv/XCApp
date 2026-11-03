const { test } = require('node:test');
const assert = require('node:assert');
const { buildEventMatcher } = require('../lib/trackEventCatalog');

// A slice of the real seeded catalog's shape, not the live DB — the
// matcher takes whatever events exist, so correcting the seed list later
// doesn't require a change here.
const CATALOG = [
  { id: 'e1', name: '100 Meters' },
  { id: 'e2', name: '100 Meter Hurdles' },
  { id: 'e3', name: '110 Meter Hurdles' },
  { id: 'e4', name: '300 Meter Hurdles' },
  { id: 'e5', name: 'Shot Put' },
  { id: 'e6', name: 'Triple Jump' },
];

test('exact names from the page match straight through', () => {
  const match = buildEventMatcher(CATALOG);
  assert.strictEqual(match('100 Meters').event.id, 'e1');
  assert.strictEqual(match('Shot Put').event.id, 'e5');
  assert.strictEqual(match('Triple Jump').event.id, 'e6');
});

test('real page aliases resolve to the catalog name', () => {
  const match = buildEventMatcher(CATALOG);
  assert.strictEqual(match('100m Hurdles').event.id, 'e2');
  assert.strictEqual(match('110m Hurdles').event.id, 'e3');
  assert.strictEqual(match('300m Hurdles').event.id, 'e4');
});

test('an event the outdoor catalog does not carry is reported, not guessed at', () => {
  const match = buildEventMatcher(CATALOG);
  for (const unmatched of ['60 Meter', '1 Mile', '1000 Meters', '2000m Steeplechase', '400m Hurdles', 'Standing Long Jump']) {
    const result = match(unmatched);
    assert.strictEqual(result.matched, false, unmatched);
    assert.strictEqual(result.event, null, unmatched);
  }
});

test('matching is case/whitespace tolerant', () => {
  const match = buildEventMatcher(CATALOG);
  assert.strictEqual(match('  shot put  ').event.id, 'e5');
  assert.strictEqual(match('SHOT PUT').event.id, 'e5');
});
