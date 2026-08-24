const test = require('node:test');
const assert = require('node:assert/strict');
const { planDedup } = require('../lib/athleteMerge');

test('a loser row with no matching keeper row is planned for repoint', () => {
  const keeperRows = [{ id: 'k1', raceId: 'race-1' }];
  const loserRows = [{ id: 'l1', raceId: 'race-2' }];
  const { repoint, drop } = planDedup(keeperRows, loserRows, (r) => r.raceId);
  assert.deepEqual(repoint, [{ id: 'l1', raceId: 'race-2' }]);
  assert.deepEqual(drop, []);
});

test('a loser row colliding with an existing keeper row is planned for drop, never repoint', () => {
  const keeperRows = [{ id: 'k1', raceId: 'race-1' }];
  const loserRows = [{ id: 'l1', raceId: 'race-1' }];
  const { repoint, drop } = planDedup(keeperRows, loserRows, (r) => r.raceId);
  assert.deepEqual(repoint, []);
  assert.deepEqual(drop, [{ id: 'l1', raceId: 'race-1' }]);
});

test('a mix of colliding and non-colliding loser rows splits correctly', () => {
  const keeperRows = [{ id: 'k1', raceId: 'race-1' }, { id: 'k2', raceId: 'race-3' }];
  const loserRows = [
    { id: 'l1', raceId: 'race-1' }, // collides with k1 -> drop
    { id: 'l2', raceId: 'race-2' }, // no collision -> repoint
    { id: 'l3', raceId: 'race-3' }, // collides with k2 -> drop
  ];
  const { repoint, drop } = planDedup(keeperRows, loserRows, (r) => r.raceId);
  assert.deepEqual(repoint.map((r) => r.id), ['l2']);
  assert.deepEqual(drop.map((r) => r.id), ['l1', 'l3']);
});

test('an empty keeper set repoints every loser row', () => {
  const loserRows = [{ id: 'l1', raceId: 'race-1' }, { id: 'l2', raceId: 'race-2' }];
  const { repoint, drop } = planDedup([], loserRows, (r) => r.raceId);
  assert.equal(repoint.length, 2);
  assert.equal(drop.length, 0);
});

test('an empty loser set produces no plan either way', () => {
  const { repoint, drop } = planDedup([{ id: 'k1', raceId: 'race-1' }], [], (r) => r.raceId);
  assert.deepEqual(repoint, []);
  assert.deepEqual(drop, []);
});
