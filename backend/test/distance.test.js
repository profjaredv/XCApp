// Fixture table for backend/lib/distance.js. Two sources:
//   1. This team's actual `SELECT distance, COUNT(*) FROM races GROUP BY
//      distance` output (5 distinct strings, 27 races total) — the real
//      data this parser has to be right about.
//   2. Every failure case documented in the red-team audit and the build
//      spec, as a regression guard even though none of them currently
//      appear in this team's own data (other imports, or future ones from
//      a different school's Athletic.net page, could hit them).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDistanceToMeters, parseDistanceToMiles, metersToMiles } = require('../lib/distance');

const MILE = 1609.34;

function assertCloseTo(actual, expected, message) {
  if (expected === null) {
    assert.strictEqual(actual, null, message);
    return;
  }
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 0.01,
    `${message}: got ${actual}, expected ~${expected}`
  );
}

test('parseDistanceToMeters — real production data (5 distinct strings, 27 races)', () => {
  const cases = [
    ['5,000 Meters', 5000], // n=15
    ['3 Miles', 3 * MILE], // n=7
    ['1 Miles', 1 * MILE], // n=2
    ['1.5 Miles', 1.5 * MILE], // n=2
    ['2 Miles', 2 * MILE], // n=1
  ];
  for (const [input, expected] of cases) {
    assertCloseTo(parseDistanceToMeters(input), expected, input);
  }
});

test('parseDistanceToMeters — audit-documented failure cases', () => {
  const cases = [
    ['5K', 5000],
    ['5,000 Meters', 5000], // the comma bug: old parsers gave 5 or 5,000,000
    ['Kittitas 5000 meters', 5000], // the "includes('k')" bug: old parsers gave 5,000,000
    ['3200m Track', 3200], // "track" contains no digits; must not confuse unit detection
    ['2 Mile', 2 * MILE],
    ['6K Varsity', 6000],
    ['1.5 Miles', 1.5 * MILE],
  ];
  for (const [input, expected] of cases) {
    assertCloseTo(parseDistanceToMeters(input), expected, input);
  }
});

test('parseDistanceToMeters — other realistic formats', () => {
  const cases = [
    ['8K', 8000],
    ['4K', 4000],
    ['6000m', 6000],
    ['3.1 Miles', 3.1 * MILE],
    ['1 Mile', MILE],
  ];
  for (const [input, expected] of cases) {
    assertCloseTo(parseDistanceToMeters(input), expected, input);
  }
});

test('parseDistanceToMeters — never guesses on unparseable input', () => {
  const cases = [null, undefined, '', '   ', 'Unknown', 'TBD', 'Varsity Boys', 42];
  for (const input of cases) {
    assert.strictEqual(parseDistanceToMeters(input), null, JSON.stringify(input));
  }
});

test('parseDistanceToMiles and metersToMiles are consistent with parseDistanceToMeters', () => {
  assertCloseTo(parseDistanceToMiles('5,000 Meters'), 5000 / MILE, '5,000 Meters in miles');
  assertCloseTo(metersToMiles(5000), 5000 / MILE, 'metersToMiles(5000)');
  assert.strictEqual(metersToMiles(0), null, 'metersToMiles(0)');
  assert.strictEqual(metersToMiles(null), null, 'metersToMiles(null)');
});
