const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, hasZero } = require('../scripts/auditSplitConvention');

// Worked examples straight from the handoff doc (Workstream C, C2).
test('classify: near-2.0 ratio reads as cumulative-signal (5:30, 11:10 -> 2.03)', () => {
  assert.equal(classify(330, 670), 'cumulative-signal');
});

test('classify: near-1.0 ratio reads as segment-signal (5:30, 5:40 -> 1.03)', () => {
  assert.equal(classify(330, 340), 'segment-signal');
});

test('classify: ratio below 1.0 is impossible under cumulative — strong segment signal', () => {
  assert.equal(classify(340, 330), 'impossible-under-cumulative');
});

test('classify: mid-range ratio that is neither near 1 nor near 2 is ambiguous', () => {
  assert.equal(classify(300, 450), 'ambiguous'); // ratio 1.5
});

test('classify: null mile1 or mile2 is ambiguous, not a crash', () => {
  assert.equal(classify(null, 340), 'ambiguous');
  assert.equal(classify(330, null), 'ambiguous');
});

test('classify: mile1 of exactly 0 is ambiguous (division by zero), not Infinity', () => {
  assert.equal(classify(0, 340), 'ambiguous');
});

test('hasZero: true when any of the three splits is exactly 0', () => {
  assert.equal(hasZero({ mile1: 0, mile2: 340, mile3: null }), true);
  assert.equal(hasZero({ mile1: 330, mile2: 0, mile3: null }), true);
  assert.equal(hasZero({ mile1: 330, mile2: 340, mile3: 0 }), true);
});

test('hasZero: false when no split is exactly 0, including when all are null', () => {
  assert.equal(hasZero({ mile1: 330, mile2: 340, mile3: null }), false);
  assert.equal(hasZero({ mile1: null, mile2: null, mile3: null }), false);
});
