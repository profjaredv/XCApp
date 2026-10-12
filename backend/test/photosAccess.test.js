// lib/photosAccess.js is the one place every Photos query is scoped by
// team_id (build spec: "a cross-team leak is the worst failure here").
// These tests exist to catch exactly that: a photoId from another team
// must come back as "not found", identically to a photoId that doesn't
// exist at all, never distinguishable from outside — plus the rest of the
// module's authorization and lifecycle behavior.
//
// Stubs prisma's model delegates by direct property assignment, same
// pattern as test/requireRole.test.js — see that file's header comment for
// why (Prisma's delegates are Proxy-based; t.mock.method doesn't work).
// lib/r2.js is stubbed the same way: photosAccess.js calls it as `r2.fn(...)`
// (a namespace import, never destructured), so its exports are reassignable
// per test exactly like a Prisma delegate.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const r2 = require('../lib/r2');
const photosAccess = require('../lib/photosAccess');
const {
  getTeamPhoto,
  createPendingPhoto,
  authorizeUpload,
  finalizeTeamPhoto,
  listTeamPhotos,
  tagPhoto,
  untagPhoto,
  setPhotoFocal,
  setPicks,
  setPhotoHidden,
  deleteTeamPhoto,
  setAthleteOptOut,
  resolveActor,
  importReadyPhoto,
  listAthletePhotosForDownload,
} = photosAccess;

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

function stubR2(method, impl) {
  const original = r2[method];
  r2[method] = async (...args) => impl(...args);
  return () => {
    r2[method] = original;
  };
}

// Prisma's array-mode $transaction validates that every element is a real
// (un-awaited, Prisma-branded) query promise — something a plain stubbed
// async function can never produce. The rest of this codebase hits the
// same wall and tests $transaction-using routes by source inspection
// instead (see test/meetDelete.test.js, test/guardianLinks.test.js); here
// it's simpler to stub $transaction itself, since photosAccess.js calls it
// as `prisma.$transaction(...)`, never destructured.
function stubTransaction() {
  const original = prisma.$transaction;
  prisma.$transaction = async (arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma));
  return () => {
    prisma.$transaction = original;
  };
}

function withActiveSeason(seasonRow) {
  const restores = [
    stub('team', 'findUnique', () => ({ currentSeason: seasonRow.year })),
    stub('season', 'findFirst', () => seasonRow),
    stub('race', 'findMany', () => []),
  ];
  return () => restores.forEach((r) => r());
}

const COACH = { id: 'coach-1', teamId: 'team-1', team: { coachUid: 'coach-1' }, isSuperAdmin: false };

// ---------------------------------------------------------------------------
// getTeamPhoto / createPendingPhoto
// ---------------------------------------------------------------------------

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

test('createPendingPhoto generates its own id and derives objectKey from it', async () => {
  let seenData;
  const restore = stub('photo', 'create', (args) => {
    seenData = args.data;
    return args.data;
  });
  try {
    await createPendingPhoto(prisma, { teamId: 'team-1', meetId: 'meet-1', sha256: 'abc123', uploadedById: 'user-1' });
    assert.strictEqual(seenData.teamId, 'team-1');
    assert.strictEqual(seenData.status, 'PENDING');
    assert.strictEqual(seenData.objectKey, r2.photoOriginalKey('team-1', seenData.id));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// authorizeUpload
// ---------------------------------------------------------------------------

test('authorizeUpload skips a file whose (team_id, sha256) already exists', async () => {
  const restores = [
    stub('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' })),
    stub('photo', 'findFirst', () => ({ id: 'existing-photo', teamId: 'team-1', sha256: 'dupe' })),
  ];
  try {
    const results = await authorizeUpload(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      files: [{ sha256: 'dupe' }],
    });
    assert.deepEqual(results, [{ photoId: 'existing-photo', duplicate: true, putUrls: null }]);
  } finally {
    restores.forEach((r) => r());
  }
});

test('authorizeUpload creates a pending row and presigns three PUT urls for a new file', async () => {
  const restores = [
    stub('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' })),
    stub('photo', 'findFirst', () => null),
    stub('photo', 'create', (args) => args.data),
    stubR2('presignPutUrl', (key) => `https://signed/${key}`),
  ];
  try {
    const results = await authorizeUpload(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      files: [{ sha256: 'new-hash' }],
    });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].duplicate, false);
    assert.ok(results[0].putUrls.original.startsWith('https://signed/'));
    assert.ok(results[0].putUrls.thumb.includes('/thumb.webp'));
    assert.ok(results[0].putUrls.web.includes('/web.webp'));
  } finally {
    restores.forEach((r) => r());
  }
});

test('authorizeUpload resumes a PENDING row from an interrupted previous attempt with fresh PUT urls, instead of treating it as an already-uploaded duplicate', async () => {
  // Same bug class as importReadyPhoto's PENDING-resume case: a browser
  // tab closing mid-upload (or a PUT that failed) can leave a row stuck
  // at PENDING, and (teamId, sha256) being a hard unique constraint means
  // there's no way to create a second row for that same hash to retry
  // with — so this has to resume the existing row rather than skip it.
  let createCalled = false;
  const restores = [
    stub('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' })),
    stub('photo', 'findFirst', () => ({ id: 'stuck-photo', teamId: 'team-1', status: 'PENDING', objectKey: 'teams/team-1/photos/stuck-photo/orig.jpg' })),
    stub('photo', 'create', () => {
      createCalled = true;
      throw new Error('must not try to insert a second row for a hash the team already has a (PENDING) row for');
    }),
    stubR2('presignPutUrl', (key) => `https://signed/${key}`),
  ];
  try {
    const results = await authorizeUpload(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      files: [{ sha256: 'stuck-hash' }],
    });
    assert.equal(createCalled, false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].photoId, 'stuck-photo');
    assert.strictEqual(results[0].duplicate, false);
    assert.ok(results[0].putUrls.original.includes('stuck-photo'));
  } finally {
    restores.forEach((r) => r());
  }
});

test('authorizeUpload refuses a meetId that does not belong to this team', async () => {
  const restore = stub('meet', 'findFirst', () => null);
  try {
    await assert.rejects(
      () => authorizeUpload(prisma, { teamId: 'team-1', meetId: 'meet-of-team-2', uploadedById: 'coach-1', files: [] }),
      /Meet not found/,
    );
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// finalizeTeamPhoto
// ---------------------------------------------------------------------------

test('finalizeTeamPhoto returns not_found for a photo in another team', async () => {
  const restore = stub('photo', 'findFirst', () => null);
  try {
    const result = await finalizeTeamPhoto(prisma, 'team-1', 'photo-owned-by-team-2');
    assert.deepEqual(result, { ok: false, reason: 'not_found' });
  } finally {
    restore();
  }
});

test('finalizeTeamPhoto never flips status if any R2 object is missing', async () => {
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1', status: 'PENDING' })),
    stubR2('objectExists', (key) => !key.includes('web.webp')), // web copy missing
  ];
  try {
    const result = await finalizeTeamPhoto(prisma, 'team-1', 'photo-1');
    assert.strictEqual(result.ok, false);
    assert.deepEqual(result.missing, { original: false, thumb: false, web: true });
  } finally {
    restores.forEach((r) => r());
  }
});

test('finalizeTeamPhoto flips PENDING to READY once all three objects exist', async () => {
  let seenWhere;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1', status: 'PENDING' })),
    stubR2('objectExists', () => true),
    stub('photo', 'updateMany', (args) => {
      seenWhere = args.where;
      return { count: 1 };
    }),
  ];
  try {
    const result = await finalizeTeamPhoto(prisma, 'team-1', 'photo-1');
    assert.strictEqual(result.ok, true);
    assert.deepEqual(seenWhere, { id: 'photo-1', teamId: 'team-1', status: 'PENDING' });
  } finally {
    restores.forEach((r) => r());
  }
});

test('finalizeTeamPhoto is idempotent on an already-ready photo', async () => {
  const restore = stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1', status: 'READY' }));
  try {
    const result = await finalizeTeamPhoto(prisma, 'team-1', 'photo-1');
    assert.deepEqual(result, { ok: true, alreadyReady: true });
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// resolveActor
// ---------------------------------------------------------------------------

test('resolveActor: the team owner is a coach via the fast path, no guardian links fetched', async () => {
  const restore = stub('guardianLink', 'findMany', () => {
    throw new Error('should not be called for a coach');
  });
  try {
    const actor = await resolveActor(prisma, COACH, 'team-1');
    assert.deepEqual(actor, { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] });
  } finally {
    restore();
  }
});

test('resolveActor: a linked athlete on this team is "self"', async () => {
  const user = { id: 'user-2', teamId: null, team: null, linkedAthlete: { id: 'athlete-9', teamId: 'team-1' } };
  const restore = stub('guardianLink', 'findMany', () => []);
  try {
    const actor = await resolveActor(prisma, user, 'team-1');
    assert.strictEqual(actor.isCoach, false);
    assert.strictEqual(actor.selfAthleteId, 'athlete-9');
    assert.deepEqual(actor.linkedAthleteIds, ['athlete-9']);
  } finally {
    restore();
  }
});

test('resolveActor: a linked athlete on a DIFFERENT team is not treated as self here', async () => {
  const user = { id: 'user-2', teamId: null, team: null, linkedAthlete: { id: 'athlete-9', teamId: 'team-2' } };
  const restore = stub('guardianLink', 'findMany', () => []);
  try {
    const actor = await resolveActor(prisma, user, 'team-1');
    assert.strictEqual(actor.selfAthleteId, null);
  } finally {
    restore();
  }
});

test('resolveActor: approved guardian links scoped to this team become guardianAthleteIds', async () => {
  const user = { id: 'parent-1', teamId: null, team: null, linkedAthlete: null };
  let seenWhere;
  const restore = stub('guardianLink', 'findMany', (args) => {
    seenWhere = args.where;
    return [{ athleteId: 'athlete-2' }, { athleteId: 'athlete-3' }];
  });
  try {
    const actor = await resolveActor(prisma, user, 'team-1');
    assert.deepEqual(seenWhere, { userId: 'parent-1', status: 'approved', athlete: { teamId: 'team-1' } });
    assert.deepEqual(actor.guardianAthleteIds, ['athlete-2', 'athlete-3']);
    assert.deepEqual(actor.linkedAthleteIds, ['athlete-2', 'athlete-3']);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// listTeamPhotos
// ---------------------------------------------------------------------------

test('listTeamPhotos hides a photo tagged with an opted-out athlete from a non-coach', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  const restores = [
    stub('photo', 'findMany', () => [
      { id: 'photo-visible', tags: [{ athleteId: 'athlete-2' }] },
      { id: 'photo-opted-out', tags: [{ athleteId: 'athlete-optout' }] },
    ]),
    stub('athlete', 'findMany', () => [{ id: 'athlete-optout' }]),
  ];
  try {
    const photos = await listTeamPhotos(prisma, 'team-1', actor);
    assert.deepEqual(photos.map((p) => p.id), ['photo-visible']);
  } finally {
    restores.forEach((r) => r());
  }
});

test('listTeamPhotos shows the coach everything, including photos with an opted-out athlete', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restore = stub('photo', 'findMany', () => [
    { id: 'photo-a', tags: [] },
    { id: 'photo-opted-out', tags: [{ athleteId: 'athlete-optout' }] },
  ]);
  try {
    const photos = await listTeamPhotos(prisma, 'team-1', actor);
    assert.deepEqual(photos.map((p) => p.id), ['photo-a', 'photo-opted-out']);
  } finally {
    restore();
  }
});

test('listTeamPhotos refuses includeHidden for a non-coach', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  await assert.rejects(() => listTeamPhotos(prisma, 'team-1', actor, { includeHidden: true }), /Only a coach/);
});

// ---------------------------------------------------------------------------
// tagPhoto / untagPhoto
// ---------------------------------------------------------------------------

test('tagPhoto refuses an athlete this actor has no authority over', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  await assert.rejects(() => tagPhoto(prisma, 'team-1', 'photo-1', 'athlete-99', actor), /cannot tag/);
});

test('tagPhoto 404s on a photo from another team even for a coach', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restore = stub('photo', 'findFirst', () => null);
  try {
    await assert.rejects(() => tagPhoto(prisma, 'team-1', 'photo-of-team-2', 'athlete-1', actor), /Photo not found/);
  } finally {
    restore();
  }
});

test('tagPhoto upserts with the resolved source and the real tagger id, never a client-supplied one', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  let seenCreate;
  const restoreSeason = withActiveSeason({ id: 'season-1', teamId: 'team-1', year: 2026 });
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('athlete', 'findFirst', () => ({ id: 'athlete-2', teamId: 'team-1' })),
    stub('seasonRoster', 'findFirst', () => null), // no explicit roster for the team -> fall back to the inferred rule
    stub('result', 'count', () => 1), // "raced this season" is enough to count as on the roster
    stub('photoAthlete', 'upsert', (args) => {
      seenCreate = args.create;
      return args.create;
    }),
  ];
  try {
    await tagPhoto(prisma, 'team-1', 'photo-1', 'athlete-2', actor);
    assert.deepEqual(seenCreate, { photoId: 'photo-1', athleteId: 'athlete-2', taggedBy: 'parent-1', source: 'PARENT' });
  } finally {
    restoreSeason();
    restores.forEach((r) => r());
  }
});

test('tagPhoto refuses an athlete who is not on the current season\'s roster (rule: locked to the current season)', async () => {
  // The actual bug report: a graduated senior from a past season was
  // still tag-eligible, because nothing but team membership was checked.
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restoreSeason = withActiveSeason({ id: 'season-1', teamId: 'team-1', year: 2026 });
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    // graduationYear in the past relative to the active season, and no
    // explicit roster row and no results this season — neither raced nor
    // still enrolled.
    stub('athlete', 'findFirst', () => ({ id: 'athlete-grad', teamId: 'team-1', graduationYear: 2022 })),
    stub('seasonRoster', 'findFirst', () => null),
    stub('result', 'count', () => 0),
  ];
  try {
    await assert.rejects(
      () => tagPhoto(prisma, 'team-1', 'photo-1', 'athlete-grad', actor),
      /not on this season's roster/,
    );
  } finally {
    restoreSeason();
    restores.forEach((r) => r());
  }
});

test('tagPhoto allows an athlete explicitly marked active on this season\'s roster, even off the inferred rule', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restoreSeason = withActiveSeason({ id: 'season-1', teamId: 'team-1', year: 2026 });
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('athlete', 'findFirst', () => ({ id: 'athlete-1', teamId: 'team-1', graduationYear: 2022 })),
    stub('seasonRoster', 'findFirst', () => ({ athleteId: 'athlete-1', seasonId: 'season-1', isActive: true })),
    stub('photoAthlete', 'upsert', (args) => args.create),
  ];
  try {
    await tagPhoto(prisma, 'team-1', 'photo-1', 'athlete-1', actor);
  } finally {
    restoreSeason();
    restores.forEach((r) => r());
  }
});

test('untagPhoto refuses removal by someone who is neither the tagger nor a coach', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findUnique', () => ({ photoId: 'photo-1', athleteId: 'athlete-2', taggedBy: 'someone-else' })),
  ];
  try {
    await assert.rejects(() => untagPhoto(prisma, 'team-1', 'photo-1', 'athlete-2', actor), /cannot remove/);
  } finally {
    restores.forEach((r) => r());
  }
});

test('untagPhoto lets a coach remove any tag', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  let deleted = false;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findUnique', () => ({ photoId: 'photo-1', athleteId: 'athlete-2', taggedBy: 'parent-1' })),
    stub('photoAthlete', 'delete', () => {
      deleted = true;
      return {};
    }),
  ];
  try {
    const result = await untagPhoto(prisma, 'team-1', 'photo-1', 'athlete-2', actor);
    assert.deepEqual(result, { ok: true, removed: true });
    assert.strictEqual(deleted, true);
  } finally {
    restores.forEach((r) => r());
  }
});

// ---------------------------------------------------------------------------
// setPhotoFocal
// ---------------------------------------------------------------------------

test('setPhotoFocal refuses an athlete this actor cannot manage', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  await assert.rejects(
    () => setPhotoFocal(prisma, 'team-1', 'photo-1', 'athlete-99', 0.2, 0.8, actor),
    /cannot reposition/,
  );
});

test('setPhotoFocal 404s on a photo from another team even for a coach', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restore = stub('photo', 'findFirst', () => null);
  try {
    await assert.rejects(() => setPhotoFocal(prisma, 'team-1', 'photo-1', 'athlete-1', 0.2, 0.8, actor), /not found/);
  } finally {
    restore();
  }
});

test('setPhotoFocal 404s when the athlete has no tag on this photo', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findUnique', () => null),
  ];
  try {
    await assert.rejects(() => setPhotoFocal(prisma, 'team-1', 'photo-1', 'athlete-1', 0.2, 0.8, actor), /not tagged/);
  } finally {
    restores.forEach((r) => r());
  }
});

test('setPhotoFocal clamps out-of-range values into 0-1 before saving', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  let savedData;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findUnique', () => ({ photoId: 'photo-1', athleteId: 'athlete-1' })),
    stub('photoAthlete', 'update', (args) => {
      savedData = args.data;
      return { athleteId: 'athlete-1', ...args.data };
    }),
  ];
  try {
    const result = await setPhotoFocal(prisma, 'team-1', 'photo-1', 'athlete-1', 1.4, -0.3, actor);
    assert.deepEqual(savedData, { focalX: 1, focalY: 0 });
    assert.deepEqual(result, { athleteId: 'athlete-1', focalX: 1, focalY: 0 });
  } finally {
    restores.forEach((r) => r());
  }
});

test('setPhotoFocal lets a guardian reposition their own linked athlete', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  let savedData;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findUnique', () => ({ photoId: 'photo-1', athleteId: 'athlete-2' })),
    stub('photoAthlete', 'update', (args) => {
      savedData = args.data;
      return { athleteId: 'athlete-2', ...args.data };
    }),
  ];
  try {
    await setPhotoFocal(prisma, 'team-1', 'photo-1', 'athlete-2', 0.3, 0.7, actor);
    assert.deepEqual(savedData, { focalX: 0.3, focalY: 0.7 });
  } finally {
    restores.forEach((r) => r());
  }
});

// ---------------------------------------------------------------------------
// setPicks
// ---------------------------------------------------------------------------

test('setPicks refuses an athlete this actor cannot manage', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  await assert.rejects(() => setPicks(prisma, 'team-1', 'athlete-99', ['photo-1'], actor), /cannot set picks/);
});

test('setPicks silently drops any photoId the athlete is not actually tagged in (rule 5)', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restoreSeason = withActiveSeason({ id: 'season-1', teamId: 'team-1', year: 2026 });
  const restoreTx = stubTransaction();
  const created = [];
  const restores = [
    stub('athlete', 'findFirst', () => ({ id: 'athlete-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findMany', () => [{ photoId: 'photo-tagged', athleteId: 'athlete-1' }]),
    stub('pick', 'deleteMany', () => ({ count: 0 })),
    stub('pick', 'create', (args) => {
      created.push(args.data);
      return args.data;
    }),
    stub('pick', 'findMany', () => created),
  ];
  try {
    const result = await setPicks(prisma, 'team-1', 'athlete-1', ['photo-tagged', 'photo-not-tagged'], actor);
    assert.deepEqual(result.map((p) => p.photoId), ['photo-tagged']);
    assert.deepEqual(created, [{ athleteId: 'athlete-1', seasonId: 'season-1', photoId: 'photo-tagged', position: 1 }]);
  } finally {
    restoreSeason();
    restoreTx();
    restores.forEach((r) => r());
  }
});

test('setPicks caps at MAX_PICKS even if more valid ids are given', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restoreSeason = withActiveSeason({ id: 'season-1', teamId: 'team-1', year: 2026 });
  const restoreTx = stubTransaction();
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const created = [];
  const restores = [
    stub('athlete', 'findFirst', () => ({ id: 'athlete-1', teamId: 'team-1' })),
    stub('photoAthlete', 'findMany', (args) => args.where.photoId.in.map((photoId) => ({ photoId, athleteId: 'athlete-1' }))),
    stub('pick', 'deleteMany', () => ({ count: 0 })),
    stub('pick', 'create', (args) => {
      created.push(args.data);
      return args.data;
    }),
    stub('pick', 'findMany', () => created),
  ];
  try {
    await setPicks(prisma, 'team-1', 'athlete-1', ids, actor);
    assert.strictEqual(created.length, photosAccess.MAX_PICKS);
  } finally {
    restoreSeason();
    restoreTx();
    restores.forEach((r) => r());
  }
});

// ---------------------------------------------------------------------------
// setPhotoHidden / deleteTeamPhoto
// ---------------------------------------------------------------------------

test('setPhotoHidden refuses a non-coach', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  await assert.rejects(() => setPhotoHidden(prisma, 'team-1', 'photo-1', true, actor), /Only a coach/);
});

test('deleteTeamPhoto removes all three R2 objects before deleting the row', async () => {
  const actor = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const deletedKeys = [];
  let rowDeleted = false;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'photo-1', teamId: 'team-1' })),
    stub('photo', 'delete', () => {
      rowDeleted = true;
      return {};
    }),
    stubR2('deleteObject', (key) => {
      deletedKeys.push(key);
    }),
  ];
  try {
    await deleteTeamPhoto(prisma, 'team-1', 'photo-1', actor);
    assert.strictEqual(deletedKeys.length, 3);
    assert.ok(deletedKeys.some((k) => k.endsWith('orig.jpg')));
    assert.ok(deletedKeys.some((k) => k.endsWith('thumb.webp')));
    assert.ok(deletedKeys.some((k) => k.endsWith('web.webp')));
    assert.strictEqual(rowDeleted, true);
  } finally {
    restores.forEach((r) => r());
  }
});

// ---------------------------------------------------------------------------
// setAthleteOptOut
// ---------------------------------------------------------------------------

test('setAthleteOptOut lets a guardian opt out their own linked athlete', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  const restore = stub('athlete', 'findFirst', () => ({ id: 'athlete-2', teamId: 'team-1' }));
  const restoreUpdate = stub('athlete', 'update', (args) => ({ id: 'athlete-2', photosOptOut: args.data.photosOptOut }));
  try {
    const result = await setAthleteOptOut(prisma, 'team-1', 'athlete-2', true, actor);
    assert.deepEqual(result, { id: 'athlete-2', photosOptOut: true });
  } finally {
    restore();
    restoreUpdate();
  }
});

test('setAthleteOptOut refuses a guardian acting on an athlete they have no link to', async () => {
  const actor = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  await assert.rejects(() => setAthleteOptOut(prisma, 'team-1', 'athlete-99', true, actor), /cannot change/);
});

// ---------------------------------------------------------------------------
// importReadyPhoto (Google Photos album import)
// ---------------------------------------------------------------------------

test('importReadyPhoto skips a hash the team already has, without touching R2', async () => {
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'existing-photo', teamId: 'team-1' })),
    stubR2('putObject', () => {
      throw new Error('should not upload a duplicate');
    }),
  ];
  try {
    const result = await importReadyPhoto(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      originalBuffer: Buffer.from('x'),
      thumbBuffer: Buffer.from('y'),
      webBuffer: Buffer.from('z'),
      sha256: 'dupe-hash',
      width: 100,
      height: 100,
    });
    assert.deepEqual(result, { duplicate: true, photoId: 'existing-photo' });
  } finally {
    restores.forEach((r) => r());
  }
});

test('importReadyPhoto uploads all three objects and marks the row ready directly, no R2 re-check', async () => {
  const putKeys = [];
  let updatedTo;
  const restores = [
    stub('photo', 'findFirst', () => null), // no existing hash
    stub('photo', 'create', (args) => args.data),
    stub('photo', 'update', (args) => {
      updatedTo = args.data.status;
      return { ...args.data };
    }),
    stubR2('putObject', (key) => {
      putKeys.push(key);
    }),
  ];
  try {
    const result = await importReadyPhoto(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      originalBuffer: Buffer.from('orig'),
      thumbBuffer: Buffer.from('thumb'),
      webBuffer: Buffer.from('web'),
      sha256: 'new-hash',
      width: 800,
      height: 600,
    });
    assert.equal(result.duplicate, false);
    assert.equal(putKeys.length, 3);
    assert.ok(putKeys.some((k) => k.endsWith('orig.jpg')));
    assert.ok(putKeys.some((k) => k.endsWith('thumb.webp')));
    assert.ok(putKeys.some((k) => k.endsWith('web.webp')));
    assert.equal(updatedTo, 'READY');
  } finally {
    restores.forEach((r) => r());
  }
});

test('importReadyPhoto resumes a row stuck at PENDING from an interrupted previous attempt, instead of treating it as an already-imported duplicate forever', async () => {
  // The real production bug: an earlier attempt's R2 writes failed after
  // the row was already created (teamId+sha256 is a hard unique
  // constraint, so the row has to exist before those writes are even
  // attempted — see importReadyPhoto's own header comment). Every later
  // re-run found that same row by hash and reported "duplicate" without
  // ever checking whether it actually had real R2 objects — so the photo
  // was never visible anywhere (listTeamPhotos only returns READY), and
  // never got retried either. This is what "188 already had, 0 failed"
  // with nothing actually showing up in the Tag module turned out to mean.
  const putKeys = [];
  let updatedId;
  let createCalled = false;
  const restores = [
    stub('photo', 'findFirst', () => ({ id: 'stuck-photo', teamId: 'team-1', objectKey: 'teams/team-1/photos/stuck-photo/orig.jpg', status: 'PENDING' })),
    stub('photo', 'create', () => {
      createCalled = true;
      throw new Error('must not try to insert a second row for a hash the team already has a (PENDING) row for');
    }),
    stub('photo', 'update', (args) => {
      updatedId = args.where.id;
      return { ...args.data };
    }),
    stubR2('putObject', (key) => {
      putKeys.push(key);
    }),
  ];
  try {
    const result = await importReadyPhoto(prisma, {
      teamId: 'team-1',
      meetId: 'meet-1',
      uploadedById: 'coach-1',
      originalBuffer: Buffer.from('orig'),
      thumbBuffer: Buffer.from('thumb'),
      webBuffer: Buffer.from('web'),
      sha256: 'stuck-hash',
      width: 800,
      height: 600,
    });
    assert.equal(createCalled, false);
    assert.equal(result.duplicate, false);
    assert.equal(result.photoId, 'stuck-photo');
    assert.equal(putKeys.length, 3);
    assert.ok(putKeys.every((k) => k.includes('stuck-photo')));
    assert.equal(updatedId, 'stuck-photo');
  } finally {
    restores.forEach((r) => r());
  }
});

test('importReadyPhoto still treats a READY (or HIDDEN) existing row as a genuine duplicate, no re-upload', async () => {
  for (const status of ['READY', 'HIDDEN']) {
    const restores = [
      stub('photo', 'findFirst', () => ({ id: 'real-photo', teamId: 'team-1', status })),
      stubR2('putObject', () => {
        throw new Error('must not re-upload a photo that is already READY or HIDDEN');
      }),
    ];
    try {
      const result = await importReadyPhoto(prisma, {
        teamId: 'team-1',
        meetId: 'meet-1',
        uploadedById: 'coach-1',
        originalBuffer: Buffer.from('x'),
        thumbBuffer: Buffer.from('y'),
        webBuffer: Buffer.from('z'),
        sha256: 'real-hash',
        width: 100,
        height: 100,
      });
      assert.deepEqual(result, { duplicate: true, photoId: 'real-photo' });
    } finally {
      restores.forEach((r) => r());
    }
  }
});

// ---------------------------------------------------------------------------
// listAthletePhotosForDownload ("download my athlete's folder")
// ---------------------------------------------------------------------------

test('listAthletePhotosForDownload lets a coach download any athlete on the team', async () => {
  const coach = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-1' }));
  let queryArgs;
  const restorePhoto = stub('photo', 'findMany', (args) => {
    queryArgs = args;
    return [{ id: 'photo-1', objectKey: 'teams/team-1/photos/photo-1/orig.jpg' }];
  });
  try {
    const photos = await listAthletePhotosForDownload(prisma, 'team-1', 'athlete-1', coach);
    assert.equal(photos.length, 1);
    assert.deepEqual(queryArgs.where, { teamId: 'team-1', status: 'READY', tags: { some: { athleteId: 'athlete-1' } } });
  } finally {
    restoreAthlete();
    restorePhoto();
  }
});

test('listAthletePhotosForDownload lets a guardian download their own linked athlete, even if opted out', async () => {
  // Opt-out means "don't show me to OTHER people's grids" — it must never
  // block the family's own access to their own photos.
  const guardian = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  const restoreAthlete = stub('athlete', 'findFirst', () => ({ id: 'athlete-2' }));
  const restorePhoto = stub('photo', 'findMany', () => [{ id: 'photo-1', objectKey: 'teams/team-1/photos/photo-1/orig.jpg' }]);
  try {
    const photos = await listAthletePhotosForDownload(prisma, 'team-1', 'athlete-2', guardian);
    assert.equal(photos.length, 1);
  } finally {
    restoreAthlete();
    restorePhoto();
  }
});

test('listAthletePhotosForDownload refuses a guardian with no link to this athlete', async () => {
  const guardian = { userId: 'parent-1', isCoach: false, selfAthleteId: null, guardianAthleteIds: ['athlete-2'], linkedAthleteIds: ['athlete-2'] };
  await assert.rejects(() => listAthletePhotosForDownload(prisma, 'team-1', 'athlete-99', guardian), /cannot download/);
});

test('listAthletePhotosForDownload refuses a volunteer session (tagging-only, no bulk export)', async () => {
  const volunteer = { userId: null, isCoach: false, isVolunteer: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  await assert.rejects(() => listAthletePhotosForDownload(prisma, 'team-1', 'athlete-1', volunteer), /cannot download/);
});

test('listAthletePhotosForDownload 404s an athlete from another team', async () => {
  const coach = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
  const restore = stub('athlete', 'findFirst', () => null);
  try {
    await assert.rejects(() => listAthletePhotosForDownload(prisma, 'team-1', 'athlete-of-another-team', coach), /Athlete not found/);
  } finally {
    restore();
  }
});
