const test = require('node:test');
const assert = require('node:assert/strict');
const { decideResultWrite, flattenMeetResults, isRankableFinish, compareByFinishTime } = require('../lib/raceResults');

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

test('status touched to a non-finish, time not touched — also clears time, not just status', () => {
  // A DNS/DNF/DQ status and a real time are mutually exclusive — a coach
  // who marks someone DNS without touching the time field must not leave
  // whatever time was previously saved there (e.g. from a Live Timer tap
  // before the runner was pulled). A stale nonzero time next to a DNS
  // status was ranking as a real, sometimes "fastest," finisher anywhere
  // downstream sorted by time without also checking status.
  assert.deepEqual(decideResultWrite({ status: 'DNS' }), { action: 'upsert', data: { time: null, status: 'DNS' } });
  assert.deepEqual(decideResultWrite({ status: 'DNF' }), { action: 'upsert', data: { time: null, status: 'DNF' } });
  assert.deepEqual(decideResultWrite({ status: 'DQ' }), { action: 'upsert', data: { time: null, status: 'DQ' } });
});

test('status touched to FINISHED, time not touched — does not clear an existing time', () => {
  const plan = decideResultWrite({ status: 'FINISHED' });
  assert.deepEqual(plan, { action: 'upsert', data: { status: 'FINISHED' } });
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
  // status: 'FINISHED' here, not a non-finish status — DNS/DNF/DQ
  // deliberately DO also touch time now (see the test above); this test
  // is about the general "don't mention what you didn't touch" rule for
  // the case where that special exception doesn't apply.
  const coachA = decideResultWrite({ time: 930 }); // only touched time
  const coachB = decideResultWrite({ status: 'FINISHED' }); // only touched status
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

  await t.test('sorts a DNS/DNF/DQ row to the end even if it has a stale nonzero time, not just a null one', () => {
    // The exact bug report: a status change to DNS/DNF saved before
    // decideResultWrite cleared time as part of that same save could
    // leave a real nonzero time sitting on a non-finish row — that must
    // never rank ahead of (or worse, as "fastest" among) real finishers.
    const results = [
      { raceId: 'r1', athleteId: 'a1', name: 'Stale DNS', time: 1, status: 'DNS' },
      { raceId: 'r1', athleteId: 'a2', name: 'Finisher', time: 1000, status: 'FINISHED' },
    ];
    const flat = flattenMeetResults(races, results);
    assert.deepEqual(flat.map((r) => r.name), ['Finisher', 'Stale DNS']);
  });

  await t.test('attaches the race name for each row, for the CSV\'s Race column', () => {
    const results = [{ raceId: 'r2', athleteId: 'a1', name: 'Girls Runner', time: 900, status: 'FINISHED' }];
    const flat = flattenMeetResults(races, results);
    assert.equal(flat[0].raceName, 'Varsity Girls');
  });
});

// The bug: "entries with 0:00 were showing up as top runners" after a
// metrics recalculation. Any view sorting/ranking results by time
// (MeetsTab's "top runners", team scoring, splits, results tables) needs
// this same rule, not just a `time != null` check.
test('isRankableFinish', () => {
  assert.equal(isRankableFinish({ status: 'FINISHED', time: 1000 }), true);
  assert.equal(isRankableFinish({ status: 'DNS', time: null }), false);
  assert.equal(isRankableFinish({ status: 'DNF', time: 1 }), false, 'a stale nonzero time on a non-finish still does not count');
  assert.equal(isRankableFinish({ status: 'DQ', time: 500 }), false);
  assert.equal(isRankableFinish({ status: 'FINISHED', time: 0 }), false, 'zero is never a real time');
  assert.equal(isRankableFinish({ status: 'FINISHED', time: null }), false);
});

test('compareByFinishTime', async (t) => {
  await t.test('sorts real finishers fastest to slowest', () => {
    const results = [
      { name: 'Slow', status: 'FINISHED', time: 1200 },
      { name: 'Fast', status: 'FINISHED', time: 1000 },
    ];
    assert.deepEqual([...results].sort(compareByFinishTime).map((r) => r.name), ['Fast', 'Slow']);
  });

  await t.test('a DNS with a stale nonzero time never outranks a real finisher, however slow', () => {
    const results = [
      { name: 'Stale DNS', status: 'DNS', time: 1 },
      { name: 'Slow Finisher', status: 'FINISHED', time: 2000 },
    ];
    assert.deepEqual([...results].sort(compareByFinishTime).map((r) => r.name), ['Slow Finisher', 'Stale DNS']);
  });

  await t.test('two non-finishers stay in their existing relative order rather than being re-sorted arbitrarily', () => {
    const results = [
      { name: 'DNF', status: 'DNF', time: null },
      { name: 'DNS', status: 'DNS', time: null },
    ];
    assert.deepEqual([...results].sort(compareByFinishTime).map((r) => r.name), ['DNF', 'DNS']);
  });
});
