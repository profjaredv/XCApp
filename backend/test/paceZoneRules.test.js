const test = require('node:test');
const assert = require('node:assert');
const { normalizePaceZone, normalizePaceZoneSet } = require('../lib/paceZoneRules');

// EHS's own definitions, as the coach wrote them, are the working examples
// throughout: if this vocabulary can't express those it isn't finished.

test('OFFSET: "Distance = 2-3 minutes slower than best 1 mile time"', () => {
  const r = normalizePaceZone({
    abbreviation: 'DIS',
    name: 'Distance',
    ruleType: 'OFFSET',
    refDistanceMeters: 1609,
    offsetFastSec: 120,
    offsetSlowSec: 180,
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.refDistanceMeters, 1609);
  assert.equal(r.value.offsetFastSec, 120);
  assert.equal(r.value.offsetSlowSec, 180);
  // The other rule's fields are nulled, not left undefined.
  assert.strictEqual(r.value.rangeDistanceAMeters, null);
  assert.strictEqual(r.value.rangeDistanceBMeters, null);
});

test('RANGE: "VO2 = 2mi to 5k race pace"', () => {
  const r = normalizePaceZone({
    abbreviation: 'VO2',
    name: 'VO2 Max',
    ruleType: 'RANGE',
    rangeDistanceAMeters: 3218,
    rangeDistanceBMeters: 5000,
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.rangeDistanceAMeters, 3218);
  assert.strictEqual(r.value.refDistanceMeters, null);
  assert.strictEqual(r.value.offsetFastSec, null);
  assert.strictEqual(r.value.offsetSlowSec, null);
});

test('offsets are stored fast-first however they are entered', () => {
  const backwards = normalizePaceZone({
    abbreviation: 'SS', name: 'Steady State', ruleType: 'OFFSET',
    refDistanceMeters: 1609, offsetFastSec: 120, offsetSlowSec: 90,
  });
  assert.ok(backwards.ok);
  assert.equal(backwards.value.offsetFastSec, 90);
  assert.equal(backwards.value.offsetSlowSec, 120);
});

test('an exact single pace is a zero-width range, not an error', () => {
  const r = normalizePaceZone({
    abbreviation: 'T', name: 'Threshold', ruleType: 'OFFSET',
    refDistanceMeters: 5000, offsetFastSec: 30, offsetSlowSec: 30,
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.offsetFastSec, 30);
  assert.equal(r.value.offsetSlowSec, 30);
});

test('a negative offset is allowed — "faster than 5k pace" is a real zone', () => {
  const r = normalizePaceZone({
    abbreviation: 'R', name: 'Repetition', ruleType: 'OFFSET',
    refDistanceMeters: 5000, offsetFastSec: -45, offsetSlowSec: -15,
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.offsetFastSec, -45);
  assert.equal(r.value.offsetSlowSec, -15);
});

test("the coach's own wording survives as notes", () => {
  const r = normalizePaceZone({
    abbreviation: 'T', name: 'Threshold', ruleType: 'OFFSET',
    refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90,
    notes: 'or :30 slower than 5k average pace',
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.notes, 'or :30 slower than 5k average pace');
});

test('blank notes normalise to null rather than an empty string', () => {
  const r = normalizePaceZone({
    abbreviation: 'T', name: 'Threshold', ruleType: 'OFFSET',
    refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90, notes: '   ',
  });
  assert.ok(r.ok);
  assert.strictEqual(r.value.notes, null);
});

test('abbreviation and name are required', () => {
  const noAbbr = normalizePaceZone({ name: 'Threshold', ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90 });
  assert.equal(noAbbr.ok, false);
  assert.match(noAbbr.error, /Abbreviation is required/);

  const noName = normalizePaceZone({ abbreviation: 'T', ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90 });
  assert.equal(noName.ok, false);
  assert.match(noName.error, /Name is required/);
});

test('an unknown rule type is rejected', () => {
  const r = normalizePaceZone({ abbreviation: 'X', name: 'Mystery', ruleType: 'VIBES' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Rule type must be one of/);
});

test('a RANGE needs two different distances', () => {
  const r = normalizePaceZone({
    abbreviation: 'VO2', name: 'VO2', ruleType: 'RANGE',
    rangeDistanceAMeters: 5000, rangeDistanceBMeters: 5000,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /two different distances/);
});

test('a distance typed in the wrong unit is caught at the edge', () => {
  // A coach meaning "1 mile" and typing "1".
  const tooSmall = normalizePaceZone({
    abbreviation: 'DIS', name: 'Distance', ruleType: 'OFFSET',
    refDistanceMeters: 1, offsetFastSec: 120, offsetSlowSec: 180,
  });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.error, /between 100 and 100000 meters/);
});

test('an offset typed in minutes instead of seconds is caught', () => {
  const r = normalizePaceZone({
    abbreviation: 'DIS', name: 'Distance', ruleType: 'OFFSET',
    refDistanceMeters: 1609, offsetFastSec: 120, offsetSlowSec: 3000,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /within 20 minutes per mile/);
});

test('non-integer input is rejected rather than silently truncated', () => {
  const r = normalizePaceZone({
    abbreviation: 'DIS', name: 'Distance', ruleType: 'OFFSET',
    refDistanceMeters: 1609.34, offsetFastSec: 120, offsetSlowSec: 180,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /whole number of meters/);
});

// --- whole-set behaviour ---

const EHS = [
  { abbreviation: 'DIS', name: 'Distance', ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 120, offsetSlowSec: 180 },
  { abbreviation: 'SS', name: 'Steady State', ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 90, offsetSlowSec: 120 },
  { abbreviation: 'T', name: 'Threshold', ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90, notes: 'or :30 slower than 5k average pace' },
  { abbreviation: 'VO2', name: 'VO2 Max', ruleType: 'RANGE', rangeDistanceAMeters: 3218, rangeDistanceBMeters: 5000 },
  { abbreviation: 'R', name: 'Repetition', ruleType: 'RANGE', rangeDistanceAMeters: 800, rangeDistanceBMeters: 1609 },
];

test("the whole EHS set round-trips", () => {
  const r = normalizePaceZoneSet(EHS);
  assert.ok(r.ok, r.error);
  assert.equal(r.value.length, 5);
  assert.deepEqual(r.value.map((z) => z.abbreviation), ['DIS', 'SS', 'T', 'VO2', 'R']);
});

test('list position becomes the display order', () => {
  const r = normalizePaceZoneSet(EHS);
  assert.ok(r.ok);
  assert.deepEqual(r.value.map((z) => z.sortOrder), [0, 1, 2, 3, 4]);
});

test('an incoming sortOrder is ignored in favour of list position', () => {
  const r = normalizePaceZoneSet([
    { ...EHS[0], sortOrder: 99 },
    { ...EHS[1], sortOrder: 3 },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.value.map((z) => z.sortOrder), [0, 1]);
});

test('duplicate abbreviations are caught before the database sees them', () => {
  const r = normalizePaceZoneSet([EHS[0], { ...EHS[1], abbreviation: 'DIS' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /share the abbreviation/);
});

test('duplicates differing only in case are caught too', () => {
  // The unique index is case-SENSITIVE, so "t" and "T" would both be
  // stored — and a coach reading the whiteboard sees one zone, twice.
  const r = normalizePaceZoneSet([EHS[2], { ...EHS[0], abbreviation: 't' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /share the abbreviation/);
});

test('the failing zone is identified by position', () => {
  const r = normalizePaceZoneSet([EHS[0], EHS[1], { ...EHS[2], abbreviation: '' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /^Zone 3:/);
});

test('an empty set is valid — it means "just use the defaults"', () => {
  const r = normalizePaceZoneSet([]);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.value, []);
});

test('a non-list is rejected', () => {
  assert.equal(normalizePaceZoneSet({ abbreviation: 'T' }).ok, false);
  assert.equal(normalizePaceZoneSet(null).ok, false);
});
