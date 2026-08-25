// T2 (Team Management handoff), verify gate T2: "Move one athlete
// mid-season, then confirm getGroupOn returns the old group for a date
// before the move and the new group after. Confirm no membership row was
// updated in place." Per rule 5 (arithmetic/permission-adjacent), tested
// before trusting.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { getGroupOn, getActiveMembersOf, moveAthleteToGroup, removeAthleteFromGroup, isMembershipActiveOn, normalizeDate } = require('../lib/groups');

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

  await t.test('a TRAINING membership and a CAPTAIN membership for the same athlete run concurrently — moving into one never touches the other', async (t) => {
    const groupTraining = { id: 'gTrain', type: 'TRAINING', name: 'Boys Blue' };
    const groupCaptain = { id: 'gCaptain', type: 'CAPTAIN', name: "Jack's Group" };

    const rows = [];
    let nextId = 1;

    const originalGroupFindUniqueOrThrow = prisma.group.findUniqueOrThrow;
    const originalMembershipFindMany = prisma.groupMembership.findMany;
    const originalMembershipUpdate = prisma.groupMembership.update;
    const originalMembershipCreate = prisma.groupMembership.create;
    const originalTransaction = prisma.$transaction;

    const groupById = { gTrain: groupTraining, gCaptain: groupCaptain };
    prisma.group.findUniqueOrThrow = async ({ where }) => {
      if (groupById[where.id]) return groupById[where.id];
      throw new Error('unknown group');
    };
    prisma.groupMembership.findMany = async ({ where }) =>
      rows
        .filter((r) => {
          if (where.athleteId && r.athleteId !== where.athleteId) return false;
          if (where.endDate === null && r.endDate !== null) return false;
          if (where.group?.type && groupById[r.groupId].type !== where.group.type) return false;
          return true;
        })
        .map((r) => ({ ...r, group: groupById[r.groupId] }));
    prisma.groupMembership.update = async ({ where, data }) => {
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

    const athleteId = 'jack';
    await moveAthleteToGroup({ athleteId, groupId: 'gTrain', effectiveDate: '2024-09-01' });
    await moveAthleteToGroup({ athleteId, groupId: 'gCaptain', effectiveDate: '2024-09-05', reason: 'named team captain' });

    const openRows = rows.filter((r) => r.endDate === null);
    assert.equal(openRows.length, 2, 'both memberships stay open — a CAPTAIN move must not close the TRAINING row');

    const training = await getGroupOn(athleteId, '2024-09-10', 'TRAINING');
    assert.equal(training.groupId, 'gTrain');
    const captain = await getGroupOn(athleteId, '2024-09-10', 'CAPTAIN');
    assert.equal(captain.groupId, 'gCaptain');
  });
});

test('removeAthleteFromGroup', async (t) => {
  await t.test('closes the active membership with no replacement row, and no-ops if none is active', async (t) => {
    const rows = [{ id: 'm1', athleteId: 'ath1', groupId: 'gA', startDate: normalizeDate('2024-09-01'), endDate: null, movedById: null, reason: null }];

    const originalFindMany = prisma.groupMembership.findMany;
    const originalUpdate = prisma.groupMembership.update;
    const originalCreate = prisma.groupMembership.create;
    let createCalls = 0;

    prisma.groupMembership.findMany = async ({ where }) =>
      rows.filter((r) => r.athleteId === where.athleteId && r.groupId === where.groupId);
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
      prisma.groupMembership.findMany = originalFindMany;
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

  await t.test('ends a bounded stint (a future endDate already set) early — not just an already-open row', async (t) => {
    // e.g. an X_TRAINING membership scheduled through 2024-10-20, sent back
    // to their training group on 2024-10-16 instead.
    const rows = [{ id: 'm1', athleteId: 'ath1', groupId: 'gX', startDate: normalizeDate('2024-10-14'), endDate: normalizeDate('2024-10-20'), movedById: null, reason: 'shin splints' }];

    const originalFindMany = prisma.groupMembership.findMany;
    const originalUpdate = prisma.groupMembership.update;
    prisma.groupMembership.findMany = async ({ where }) =>
      rows.filter((r) => r.athleteId === where.athleteId && r.groupId === where.groupId);
    prisma.groupMembership.update = async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    };
    t.after(() => {
      prisma.groupMembership.findMany = originalFindMany;
      prisma.groupMembership.update = originalUpdate;
    });

    const removed = await removeAthleteFromGroup({ athleteId: 'ath1', groupId: 'gX', effectiveDate: '2024-10-16' });
    assert.equal(removed.id, 'm1');
    assert.equal(removed.endDate.getTime(), normalizeDate('2024-10-16').getTime(), 'the scheduled end date is pulled in, not left at 10-20');
  });
});

test('getActiveMembersOf', async (t) => {
  await t.test('includes a bounded stint still within its window and excludes one that already expired, without touching endDate: null in the query', async (t) => {
    const rows = [
      { id: 'm1', athleteId: 'still-in', groupId: 'gX', startDate: normalizeDate('2024-10-10'), endDate: normalizeDate('2024-10-20') },
      { id: 'm2', athleteId: 'already-back', groupId: 'gX', startDate: normalizeDate('2024-09-01'), endDate: normalizeDate('2024-09-10') },
      { id: 'm3', athleteId: 'open-ended', groupId: 'gX', startDate: normalizeDate('2024-10-01'), endDate: null },
    ];

    const originalFindMany = prisma.groupMembership.findMany;
    let queriedWhere = null;
    prisma.groupMembership.findMany = async ({ where }) => {
      queriedWhere = where;
      return rows.filter((r) => r.groupId === where.groupId);
    };
    t.after(() => {
      prisma.groupMembership.findMany = originalFindMany;
    });

    const active = await getActiveMembersOf('gX', '2024-10-15');
    assert.deepEqual(active.map((m) => m.athleteId).sort(), ['open-ended', 'still-in']);
    assert.equal('endDate' in queriedWhere, false, 'must not filter on endDate in the query — that would miss bounded-but-not-yet-expired rows');
  });
});
