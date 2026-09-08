const test = require('node:test');
const assert = require('node:assert/strict');
const { decideResultWrite, flattenMeetResults } = require('../lib/raceResults');

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

// GET /:meetId/results — combining every race's results into one CSV
// export, in the order a coach would actually read a results sheet:
// race by race, fastest to slowest within each.
test('flattenMeetResults', async (t) => {
  const races = [
    { id: 'r1', name: 'Varsity Boys' },
    { id: 'r2', name: 'Varsity Girls' },
  ];

  await t.test('sorts fastest to slowest within a race', () => {
    const results = [
      { raceId: 'r1', athleteId: 'a1', name: 'Slow Runner', time: 1200, status: 'FINISHED' },
      { raceId: 'r1', athleteId: 'a2', name: 'Fast Runner', time: 1000, status: 'FINISHED' },
    ];
    const flat = flattenMeetResults(races, results);
    assert.deepEqual(flat.map((r) => r.name), ['Fast Runner', 'Slow Runner']);
  });

  await t.test('keeps races in the given order, not alphabetical or by fastest overall time', () => {
    const results = [
      { raceId: 'r2', athleteId: 'a1', name: 'Girls Runner', time: 900, status: 'FINISHED' },
      { raceId: 'r1', athleteId: 'a2', name: 'Boys Runner', time: 1100, status: 'FINISHED' },
    ];
    const flat = flattenMeetResults(races, results);
    assert.deepEqual(flat.map((r) => r.raceId), ['r1', 'r2']);
  });

  await t.test('sorts a non-finisher (no time) to the end of their own race, not before every finisher', () => {
    const results = [
      { raceId: 'r1', athleteId: 'a1', name: 'DNF Runner', time: null, status: 'DNF' },
      { raceId: 'r1', athleteId: 'a2', name: 'Finisher', time: 1000, status: 'FINISHED' },
    ];
    const flat = flattenMeetResults(races, results);
    assert.deepEqual(flat.map((r) => r.name), ['Finisher', 'DNF Runner']);
  });

  await t.test('attaches the race name for each row, for the CSV\'s Race column', () => {
    const results = [{ raceId: 'r2', athleteId: 'a1', name: 'Girls Runner', time: 900, status: 'FINISHED' }];
    const flat = flattenMeetResults(races, results);
    assert.equal(flat[0].raceName, 'Varsity Girls');
  });
});
