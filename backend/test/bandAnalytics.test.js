const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  computeBandRanges,
  bandForRank,
  summarizeBand,
  assignBandEntries,
  computeSeasonPayload,
} = require('../lib/bandAnalytics');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { MILE_IN_METERS } = require('../lib/distance');

// Part B (XCApp Pre-Season Fixes + Phase 3 doc), Verify Gate B. This
// sandbox has no DATABASE_URL — every check the doc asks to run against
// live/test-DB data is instead run here against constructed fixtures that
// exercise the exact same pure functions routes/bandAnalytics.js calls, so
// nothing in this gate is left as "trust me."

function makeEntry(athleteId, raceId, time, distanceMeters, fieldMeanSec) {
  return {
    athleteId,
    raceId,
    time,
    paceSecPerMile: paceSecPerMile(time, distanceMeters),
    fieldRatio: fieldMeanSec != null ? time / fieldMeanSec : null,
  };
}

// 1. Hand-calculate a top-20 mean pace against raw results.
test('Verify Gate B #1: top-band mean pace matches an independently hand-calculated value', () => {
  // 60 athletes, one 5000m race each, times 1005s, 1010s, ..., 1300s (i.e.
  // athlete i's time is 1000 + i*5, i = 1..60). Same distance for everyone,
  // so ranking by time and ranking by pace agree — rank 1..20 are exactly
  // the 20 fastest (smallest) times.
  const distanceMeters = 5000;
  const entries = [];
  for (let i = 1; i <= 60; i++) {
    entries.push(makeEntry(`athlete-${i}`, 'race-1', 1000 + i * 5, distanceMeters));
  }

  const payload = computeSeasonPayload(entries, { mode: 'meet', topSize: 20, bottomSize: 30 });

  // Hand calculation: the 20 fastest times are 1005..1100 (i=1..20).
  const top20Times = Array.from({ length: 20 }, (_, idx) => 1000 + (idx + 1) * 5);
  const miles = distanceMeters / MILE_IN_METERS;
  const expectedMeanPace = top20Times.reduce((s, t) => s + t / miles, 0) / top20Times.length;

  assert.equal(payload.bands.top.athleteCount, 20);
  assert.ok(
    Math.abs(payload.bands.top.meanPaceSecPerMile - expectedMeanPace) < 0.001,
    `expected top-band mean pace ~${expectedMeanPace}, got ${payload.bands.top.meanPaceSecPerMile}`
  );
});

// 2. Meet-mode vs season-mode band membership differs, and is explicable.
test('Verify Gate B #2: meet-mode and season-mode assign the same athlete to different bands, explicably', () => {
  // 9 athletes -> collapses to two bands (top third = 3, bottom = 6).
  // Athlete "swing" runs a fast race (rank 1, clearly top) and a slow race
  // (rank 9, clearly bottom). Everyone else runs one race each, at a fixed
  // pace, so they don't contend for the same ranks both times.
  const distanceMeters = 5000;
  const entries = [
    makeEntry('swing', 'race-fast', 900, distanceMeters),
    makeEntry('swing', 'race-slow', 2000, distanceMeters),
  ];
  // race-fast: swing (900) + 8 others slower, so swing ranks 1st.
  for (let i = 1; i <= 8; i++) entries.push(makeEntry(`fast-field-${i}`, 'race-fast', 1000 + i * 50, distanceMeters));
  // race-slow: swing (2000) + 8 others faster, so swing ranks 9th (last).
  for (let i = 1; i <= 8; i++) entries.push(makeEntry(`slow-field-${i}`, 'race-slow', 900 + i * 20, distanceMeters));

  const ranges = computeBandRanges(9, 20, 30); // 9 < 50 -> collapsed
  assert.equal(ranges.collapsed, true);
  assert.deepEqual(ranges.top, [1, 3]);
  assert.equal(ranges.middle, null);
  assert.deepEqual(ranges.bottom, [4, 9]);

  const meetBands = assignBandEntries(entries, 'meet', ranges);
  const seasonBands = assignBandEntries(entries, 'season', ranges);

  // Meet mode: swing's race-fast entry is ranked top, race-slow entry is
  // ranked bottom — the same athlete appears in both band pools.
  assert.ok(meetBands.top.some((e) => e.athleteId === 'swing' && e.raceId === 'race-fast'));
  assert.ok(meetBands.bottom.some((e) => e.athleteId === 'swing' && e.raceId === 'race-slow'));

  // Season mode: swing's season-best pace (900s, from race-fast) is the
  // fastest in the whole season, so swing is ranked #1 for the season and
  // BOTH of swing's races — including the slow one — pool into the top
  // band. Swing never appears in the bottom band pool in season mode.
  assert.ok(seasonBands.top.some((e) => e.athleteId === 'swing' && e.raceId === 'race-fast'));
  assert.ok(seasonBands.top.some((e) => e.athleteId === 'swing' && e.raceId === 'race-slow'));
  assert.ok(!seasonBands.bottom.some((e) => e.athleteId === 'swing'));
});

// 3. Roster under 50 collapses to two bands.
test('Verify Gate B #3: a roster under 50 collapses to two bands (no middle)', () => {
  const ranges49 = computeBandRanges(49, 20, 30);
  assert.equal(ranges49.collapsed, true);
  assert.equal(ranges49.middle, null);
  assert.deepEqual(ranges49.top, [1, Math.ceil(49 / 3)]);

  const ranges50 = computeBandRanges(50, 20, 30);
  assert.equal(ranges50.collapsed, false);
  assert.notEqual(ranges50.middle, null);
  assert.deepEqual(ranges50.top, [1, 20]);
  assert.deepEqual(ranges50.middle, [21, 20]); // 50-30=20 < 21: an empty (but present) middle at the boundary
  assert.deepEqual(ranges50.bottom, [21, 50]);
});

// 4. A band with fewer than 5 athletes returns insufficientDepth: true.
test('Verify Gate B #4: a 4-athlete band returns insufficientDepth: true with no statistics', () => {
  // Roster of 54: top = 1-20 (20 athletes), middle = 21-24 (4 athletes),
  // bottom = 25-54 (30 athletes). The middle band is exactly 4 deep.
  const distanceMeters = 5000;
  const entries = [];
  for (let i = 1; i <= 54; i++) {
    entries.push(makeEntry(`athlete-${i}`, 'race-1', 1000 + i * 5, distanceMeters));
  }

  const payload = computeSeasonPayload(entries, { mode: 'meet', topSize: 20, bottomSize: 30 });

  assert.equal(payload.bands.middle.athleteCount, 4);
  assert.equal(payload.bands.middle.insufficientDepth, true);
  assert.equal(payload.bands.middle.meanPaceSecPerMile, undefined);
  assert.equal(payload.bands.top.insufficientDepth, false);
  assert.equal(payload.bands.bottom.insufficientDepth, false);
});

// 5. Championship/state races are never excluded — structurally, not just
// by convention: lib/bandAnalytics.js never receives or inspects a race
// name at all, so there is nothing in it that COULD reproduce the old
// /state|championship/i bug. Checked two ways: a fixture race that would
// have matched that old regex still counts fully, and a source-level
// guard against the pattern ever being reintroduced.
test('Verify Gate B #5: a championship-named race is never excluded from band stats', () => {
  // raceId deliberately named the way the old buggy regex matched against
  // (a race NAME, not id, in the original bug) — a realistic stand-in
  // since this module has no race-name field to filter on in the first
  // place. 60 athletes so the top band clears MIN_BAND_SIZE and produces
  // real statistics, same roster shape as Verify Gate B #1.
  const distanceMeters = 5000;
  const entries = [];
  for (let i = 1; i <= 60; i++) {
    entries.push(makeEntry(`athlete-${i}`, 'state-championship-meet', 1000 + i * 5, distanceMeters));
  }

  const payload = computeSeasonPayload(entries, { mode: 'meet', topSize: 20, bottomSize: 30 });
  assert.equal(payload.rosterSize, 60);
  assert.equal(payload.bands.top.insufficientDepth, false);
  assert.equal(payload.bands.top.raceCount, 1);
  assert.equal(payload.bands.top.athleteCount, 20);

  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bandAnalytics.js'), 'utf8');
  assert.doesNotMatch(source, /state\|championship/i);
});

// 6 & 7. Pace is always complete; fieldRatio columns only appear once
// fieldMeanSec-derived ratios are present in the entries, with no endpoint
// change required — summarizeBand's own conditional spread is the switch.
test('Verify Gate B #6/#7: band summaries always have pace, only have fieldRatio once it exists in the data', () => {
  // 60 athletes again, so the top band (20 athletes) clears MIN_BAND_SIZE
  // and actually produces statistics to inspect.
  const distanceMeters = 5000;

  const withoutFieldData = [];
  for (let i = 1; i <= 60; i++) withoutFieldData.push(makeEntry(`athlete-${i}`, 'race-1', 1000 + i * 5, distanceMeters, null));
  const payloadWithout = computeSeasonPayload(withoutFieldData, { mode: 'meet', topSize: 20, bottomSize: 30 });
  assert.equal(typeof payloadWithout.bands.top.meanPaceSecPerMile, 'number');
  assert.equal('meanFieldRatio' in payloadWithout.bands.top, false);
  assert.equal('medianFieldRatio' in payloadWithout.bands.top, false);

  // Same fixture, this time as if the meet scraper had populated
  // Race.fieldMeanSec for this race — no other change. This is the "no
  // endpoint change required" the doc asks to confirm: summarizeBand's own
  // conditional spread is the only switch involved.
  const withFieldData = [];
  for (let i = 1; i <= 60; i++) withFieldData.push(makeEntry(`athlete-${i}`, 'race-1', 1000 + i * 5, distanceMeters, 1100));
  const payloadWith = computeSeasonPayload(withFieldData, { mode: 'meet', topSize: 20, bottomSize: 30 });
  assert.equal(typeof payloadWith.bands.top.meanPaceSecPerMile, 'number');
  assert.equal(typeof payloadWith.bands.top.meanFieldRatio, 'number');
  assert.equal(typeof payloadWith.bands.top.medianFieldRatio, 'number');
});

// Sanity check on bandForRank's boundaries directly, since #1-#4 above
// exercise it only indirectly through computeSeasonPayload.
test('bandForRank: boundaries are inclusive and non-overlapping', () => {
  const ranges = { top: [1, 20], middle: [21, 24], bottom: [25, 54] };
  assert.equal(bandForRank(1, ranges), 'top');
  assert.equal(bandForRank(20, ranges), 'top');
  assert.equal(bandForRank(21, ranges), 'middle');
  assert.equal(bandForRank(24, ranges), 'middle');
  assert.equal(bandForRank(25, ranges), 'bottom');
  assert.equal(bandForRank(54, ranges), 'bottom');
  assert.equal(bandForRank(55, ranges), null);
});
