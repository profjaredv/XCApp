// lib/photosAccess.js is the one place every Photos query is scoped by
// team_id (build spec: "a cross-team leak is the worst failure here").
// These tests exist to catch exactly that: a photoId from another team
// must come back as "not found", identically to a photoId that doesn't
// exist at all, never distinguishable from outside.
//
// Stubs prisma's model delegates by direct property assignment, same
// pattern as test/requireRole.test.js — see that file's header comment for
// why (Prisma's delegates are Proxy-based; t.mock.method doesn't work).
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { getTeamPhoto, createPendingPhoto, finalizeTeamPhoto } = require('../lib/photosAccess');

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

test('getTeamPhoto passes both id and teamId in the same where clause', async () => {
  let seenWhere;
  const restore = stub('photo', 'findFirst', (args) => {
    seenWhere = args.where;
    return null;
  });
  try {
    await getTeamPhoto(prisma, 'team-1', 'photo-1');
    assert.deepEqual(seenWhere, { id: 'photo-1', teamId: 'team-1' });
  } finally {
    restore();
  }
});

test('getTeamPhoto returns null for a photo that belongs to another team', async () => {
  // A findFirst scoped by { id, teamId } together is exactly what makes
  // this possible: the row exists, but not under this team_id, so the
  // query itself returns nothing — there is no separate "wrong team" case
  // to accidentally forget to check.
  const restore = stub('photo', 'findFirst', () => null);
  try {
    const result = await getTeamPhoto(prisma, 'team-1', 'photo-owned-by-team-2');
    assert.strictEqual(result, null);
  } finally {
    restore();
  }
});

test('createPendingPhoto writes the caller-supplied teamId, not a client-supplied one', async () => {
  let seenData;
  const restore = stub('photo', 'create', (args) => {
    seenData = args.data;
    return { id: 'new-photo', ...args.data };
  });
  try {
    await createPendingPhoto(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      objectKey: 'teams/team-1/photos/new-photo/orig.jpg',
      sha256: 'abc123',
      uploadedById: 'user-1',
    });
    assert.strictEqual(seenData.teamId, 'team-1');
    assert.strictEqual(seenData.status, 'PENDING');
  } finally {
    restore();
  }
});

test('finalizeTeamPhoto only flips status when the update actually matched a row', async () => {
  const restoreZero = stub('photo', 'updateMany', () => ({ count: 0 }));
  try {
    const finalized = await finalizeTeamPhoto(prisma, 'team-1', 'photo-in-another-team');
    assert.strictEqual(finalized, false);
  } finally {
    restoreZero();
  }

  let seenWhere;
  const restoreOne = stub('photo', 'updateMany', (args) => {
    seenWhere = args.where;
    return { count: 1 };
  });
  try {
    const finalized = await finalizeTeamPhoto(prisma, 'team-1', 'photo-1');
    assert.strictEqual(finalized, true);
    assert.deepEqual(seenWhere, { id: 'photo-1', teamId: 'team-1', status: 'PENDING' });
  } finally {
    restoreOne();
  }
});
