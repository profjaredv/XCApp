// T2 (Team Management handoff), verify gate T2: "Move one athlete
// mid-season, then confirm getGroupOn returns the old group for a date
// before the move and the new group after. Confirm no membership row was
// updated in place." Per rule 5 (arithmetic/permission-adjacent), tested
// before trusting.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { getGroupOn, moveAthleteToGroup, removeAthleteFromGroup, isMembershipActiveOn, normalizeDate } = require('../lib/groups');

test('normalizeDate collapses to a UTC midnight Date regardless of input time-of-day', () => {
  const a = normalizeDate('2024-09-15T18:30:00Z');
  const b = normalizeDate(new Date('2024-09-15T00:00:00Z'));
  assert.equal(a.getTime(), b.getTime());
});

test('isMembershipActiveOn', async (t) => {
  await t.test('false before startDate', () => {
    const m = { startDate: '2024-09-01', endDate: null };
    assert.equal(isMembershipActiveOn(m, '2024-08-31'), false);
  });

  await t.test('true on startDate itself (inclusive)', () => {
    const m = { startDate: '2024-09-01', endDate: null };
    assert.equal(isMembershipActiveOn(m, '2024-09-01'), true);
  });

  await t.test('true with no endDate, arbitrarily far in the future', () => {
    const m = { startDate: '2024-09-01', endDate: null };
    assert.equal(isMembershipActiveOn(m, '2025-06-01'), true);
  });

  await t.test('true the day before endDate, false ON endDate (exclusive)', () => {
    const m = { startDate: '2024-09-01', endDate: '2024-10-15' };
    assert.equal(isMembershipActiveOn(m, '2024-10-14'), true);
    assert.equal(isMembershipActiveOn(m, '2024-10-15'), false);
  });
});

test('getGroupOn / moveAthleteToGroup', async (t) => {
  await t.test('mid-season move: getGroupOn returns the old group before, the new group after, and no row was updated in place', async (t) => {
    const groupA = { id: 'gA', type: 'TRAINING', name: 'Group A' };
    const groupB = { id: 'gB', type: 'TRAINING', name: 'Group B' };

    // In-memory fake table, standing in for prisma.groupMembership /
    // prisma.group — asserts moveAthleteToGroup only ever creates rows or
    // patches endDate, never groupId, on an existing row.
    const rows = [];
    let nextId = 1;
    const updatedRowIds = [];

    const originalGroupFindUniqueOrThrow = prisma.group.findUniqueOrThrow;
    const originalMembershipFindMany = prisma.groupMembership.findMany;
    const originalMembershipUpdate = prisma.groupMembership.update;
    const originalMembershipCreate = prisma.groupMembership.create;
    const originalTransaction = prisma.$transaction;

    prisma.group.findUniqueOrThrow = async ({ where }) => {
      if (where.id === 'gA') return groupA;
      if (where.id === 'gB') return groupB;
      throw new Error('unknown group');
    };
    prisma.groupMembership.findMany = async ({ where }) => {
      return rows.filter((r) => {
        if (where.athleteId && r.athleteId !== where.athleteId) return false;
        if (where.endDate === null && r.endDate !== null) return false;
        if (where.group?.type) {
          const g = r.groupId === 'gA' ? groupA : groupB;
          if (g.type !== where.group.type) return false;
        }
        return true;
      }).map((r) => ({ ...r, group: r.groupId === 'gA' ? groupA : groupB }));
    };
    prisma.groupMembership.update = async ({ where, data }) => {
      updatedRowIds.push(where.id);
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    };
    prisma.groupMembership.create = async ({ data }) => {
      const row = { id: `m${nextId++}`, endDate: null, movedById: null, reason: null, ...data };
      rows.push(row);
      return row;
    };
    prisma.$transaction = async (fn) => fn(prisma);

    t.after(() => {
      prisma.group.findUniqueOrThrow = originalGroupFindUniqueOrThrow;
      prisma.groupMembership.findMany = originalMembershipFindMany;
      prisma.groupMembership.update = originalMembershipUpdate;
      prisma.groupMembership.create = originalMembershipCreate;
      prisma.$transaction = originalTransaction;
    });

    const athleteId = 'ath1';

    // Season starts in Group A on Sep 1.
    const initial = await moveAthleteToGroup({ athleteId, groupId: 'gA', effectiveDate: '2024-09-01' });
    assert.equal(initial.groupId, 'gA');
    assert.equal(initial.endDate, null);

    // Moved to Group B on Oct 15.
    const moved = await moveAthleteToGroup({ athleteId, groupId: 'gB', effectiveDate: '2024-10-15' });
    assert.equal(moved.groupId, 'gB');
    assert.equal(rows.length, 2, 'expected exactly 2 rows: the original (now closed) and the new one');

    const originalRow = rows.find((r) => r.id === initial.id);
    assert.equal(originalRow.groupId, 'gA', 'the original row\'s groupId must never change');
    assert.equal(originalRow.endDate.getTime(), normalizeDate('2024-10-15').getTime(), 'the original row should be closed with the move date');
    assert.deepEqual(updatedRowIds, [initial.id], 'update() must only ever be called on the OLD row, never the new one');

    const beforeMove = await getGroupOn(athleteId, '2024-10-01');
    assert.equal(beforeMove.groupId, 'gA');

    const onMoveDate = await getGroupOn(athleteId, '2024-10-15');
    assert.equal(onMoveDate.groupId, 'gB', 'the move date itself belongs to the new group');

    const afterMove = await getGroupOn(athleteId, '2024-11-01');
    assert.equal(afterMove.groupId, 'gB');
  });
});

test('removeAthleteFromGroup', async (t) => {
  await t.test('closes the active membership with no replacement row, and no-ops if none is active', async (t) => {
    const rows = [{ id: 'm1', athleteId: 'ath1', groupId: 'gA', startDate: normalizeDate('2024-09-01'), endDate: null, movedById: null, reason: null }];

    const originalFindFirst = prisma.groupMembership.findFirst;
    const originalUpdate = prisma.groupMembership.update;
    const originalCreate = prisma.groupMembership.create;
    let createCalls = 0;

    prisma.groupMembership.findFirst = async ({ where }) =>
      rows.find((r) => r.athleteId === where.athleteId && r.groupId === where.groupId && r.endDate === null) ?? null;
    prisma.groupMembership.update = async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    };
    prisma.groupMembership.create = async () => {
      createCalls++;
      throw new Error('removeAthleteFromGroup must never create a row');
    };

    t.after(() => {
      prisma.groupMembership.findFirst = originalFindFirst;
      prisma.groupMembership.update = originalUpdate;
      prisma.groupMembership.create = originalCreate;
    });

    const removed = await removeAthleteFromGroup({ athleteId: 'ath1', groupId: 'gA', effectiveDate: '2024-10-15', movedById: 'coach1', reason: 'cut from squad' });
    assert.equal(removed.id, 'm1');
    assert.equal(removed.groupId, 'gA', 'groupId on the closed row is untouched');
    assert.equal(removed.endDate.getTime(), normalizeDate('2024-10-15').getTime());
    assert.equal(removed.movedById, 'coach1');
    assert.equal(rows.length, 1, 'no new row created');
    assert.equal(createCalls, 0);

    // Calling it again (already removed) is a no-op, not an error.
    const noOp = await removeAthleteFromGroup({ athleteId: 'ath1', groupId: 'gA', effectiveDate: '2024-10-20' });
    assert.equal(noOp, null);
  });
});
