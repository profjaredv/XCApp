const test = require('node:test');
const assert = require('node:assert/strict');
const { decideResultWrite } = require('../lib/raceResults');

// The concurrent-edit safety this exists for: two coaches with the same
// race's "Enter Results" dialog open, saving different athletes (or even
// different fields of the same athlete) around the same time, must never
// have one save revert or delete the other's already-saved result.

test('an entry with neither field present is a no-op — nothing this save should touch', () => {
  assert.deepEqual(decideResultWrite({}), { action: 'skip' });
});

test('time touched and filled in, status not touched — upserts time only', () => {
  const plan = decideResultWrite({ time: 930 });
  assert.deepEqual(plan, { action: 'upsert', data: { time: 930 } });
});

test('status touched, time not touched — upserts status only (e.g. marking DNS with no time yet)', () => {
  const plan = decideResultWrite({ status: 'DNS' });
  assert.deepEqual(plan, { action: 'upsert', data: { status: 'DNS' } });
});

test('both touched — upserts both', () => {
  const plan = decideResultWrite({ time: 930, status: 'FINISHED' });
  assert.deepEqual(plan, { action: 'upsert', data: { time: 930, status: 'FINISHED' } });
});

test('time touched and blanked, status not touched — deletes (clearing a bad entry)', () => {
  assert.deepEqual(decideResultWrite({ time: null }), { action: 'delete' });
  assert.deepEqual(decideResultWrite({ time: '' }), { action: 'delete' });
});

test('time touched and blanked WITH a real status override alongside it — upserts, does not delete', () => {
  // e.g. "no time, but mark them DNS" — a coherent result, not a blank row.
  const plan = decideResultWrite({ time: null, status: 'DNS' });
  assert.deepEqual(plan, { action: 'upsert', data: { time: null, status: 'DNS' } });
});

test('an invalid (non-positive) touched time is skipped, not written and not deleted', () => {
  assert.deepEqual(decideResultWrite({ time: 0 }), { action: 'skip' });
  assert.deepEqual(decideResultWrite({ time: -5 }), { action: 'skip' });
});

test('an unrecognized status value falls back to FINISHED, same as no status', () => {
  const plan = decideResultWrite({ status: 'bogus' });
  assert.deepEqual(plan, { action: 'upsert', data: { status: 'FINISHED' } });
});

test('two coaches, two different fields for the same athlete — neither plan mentions the field the other one touched', () => {
  const coachA = decideResultWrite({ time: 930 }); // only touched time
  const coachB = decideResultWrite({ status: 'DQ' }); // only touched status
  assert.ok(!('status' in coachA.data));
  assert.ok(!('time' in coachB.data));
});
