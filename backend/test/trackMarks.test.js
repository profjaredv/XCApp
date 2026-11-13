// Test table built from real strings copied off Ellensburg's own Event
// Progress page (backend/lib/trackMarks.js's header explains why this
// matters: the feet-inches hazard corrupts silently, not loudly).
const { test } = require('node:test');
const assert = require('node:assert');
const { parseFeetInches, formatFeetInches, parseSeconds, parseMark } = require('../lib/trackMarks');

test('parseFeetInches: real throw/jump strings from the page', () => {
  assert.strictEqual(parseFeetInches('17\' 8.5"'), 212.5);
  assert.strictEqual(parseFeetInches('32\' 1"'), 385);
  assert.strictEqual(parseFeetInches('34\' 2.5"'), 410.5);
  assert.strictEqual(parseFeetInches('37\' 8.75"'), 452.75);
  assert.strictEqual(parseFeetInches('10\' 0"'), 120);
  assert.strictEqual(parseFeetInches('100\' 11"'), 1211);
  assert.strictEqual(parseFeetInches('11\' 7.5"'), 139.5);
});

test('parseFeetInches: dash form (defensive, not seen on the real page)', () => {
  assert.strictEqual(parseFeetInches('18-06.25'), 222.25);
  assert.strictEqual(parseFeetInches('18-06'), 222);
});

test('parseFeetInches: unparseable input returns null, never 0', () => {
  assert.strictEqual(parseFeetInches(''), null);
  assert.strictEqual(parseFeetInches('NH'), null);
  assert.strictEqual(parseFeetInches(null), null);
});

test('formatFeetInches round-trips a real mark', () => {
  assert.strictEqual(formatFeetInches(212.5), '17\' 8.5"');
  assert.strictEqual(formatFeetInches(385), '32\' 1"');
});

test('parseSeconds: sprint decimals, including a hand-timed "c" suffix', () => {
  assert.strictEqual(parseSeconds('13.42'), 13.42);
  assert.strictEqual(parseSeconds('12.80c'), 12.8);
  assert.strictEqual(parseSeconds('26.00c'), 26);
});

test('parseSeconds: mm:ss(.d) distance times, reusing lib/time.js', () => {
  assert.ok(Math.abs(parseSeconds('2:54.92') - 174.92) < 1e-9);
  assert.strictEqual(parseSeconds('3:40.20'), 220.2);
});

test('parseMark: status tokens never produce a markValue', () => {
  assert.deepStrictEqual(parseMark('NT', 'SECONDS'), { markValue: null, status: 'NM' });
  assert.deepStrictEqual(parseMark('ND', 'FEET_INCHES'), { markValue: null, status: 'NM' });
  assert.deepStrictEqual(parseMark('NH', 'FEET_INCHES'), { markValue: null, status: 'NM' });
  assert.deepStrictEqual(parseMark('DNS', 'SECONDS'), { markValue: null, status: 'DNS' });
  assert.deepStrictEqual(parseMark('DQ', 'SECONDS'), { markValue: null, status: 'DQ' });
  assert.deepStrictEqual(parseMark('SCR', 'FEET_INCHES'), { markValue: null, status: 'DNS' });
  assert.deepStrictEqual(parseMark('', 'SECONDS'), { markValue: null, status: 'DNS' });
});

test('parseMark: a real throw and a real sprint time, end to end', () => {
  assert.deepStrictEqual(parseMark(' 34\' 2.5" ', 'FEET_INCHES'), { markValue: 410.5, status: 'FINISHED' });
  assert.deepStrictEqual(parseMark(' 13.42 ', 'SECONDS'), { markValue: 13.42, status: 'FINISHED' });
});
