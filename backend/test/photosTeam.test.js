// middleware/photosTeam.js: LeadPack Photos' own team-resolution and
// feature gate, split out specifically because a guardian account is
// never a TeamMember (routes/guardian.js) — req.user.teamId is null for
// them, so the shared requireTeam/requireFeature middleware can't apply.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { resolvePhotosTeam, requirePhotosFeatureEnabled } = require('../middleware/photosTeam');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

test('resolvePhotosTeam uses req.user.teamId directly for a real team member', async () => {
  const req = { user: { id: 'coach-1', teamId: 'team-1' } };
  let nexted = false;
  await resolvePhotosTeam(req, mockRes(), () => {
    nexted = true;
  });
  assert.equal(nexted, true);
  assert.equal(req.photosTeamId, 'team-1');
});

test('resolvePhotosTeam falls back to an approved GuardianLink for a guardian account', async () => {
  const req = { user: { id: 'parent-1', teamId: null } };
  const restore = stub('guardianLink', 'findFirst', (args) => {
    assert.deepEqual(args.where, { userId: 'parent-1', status: 'approved' });
    return { athlete: { teamId: 'team-2' } };
  });
  let nexted = false;
  try {
    await resolvePhotosTeam(req, mockRes(), () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, true);
  assert.equal(req.photosTeamId, 'team-2');
});

test('resolvePhotosTeam 403s an account with no team and no approved guardian link', async () => {
  const req = { user: { id: 'stranger-1', teamId: null } };
  const restore = stub('guardianLink', 'findFirst', () => null);
  const res = mockRes();
  let nexted = false;
  try {
    await resolvePhotosTeam(req, res, () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

test('requirePhotosFeatureEnabled 403s when the team turned photos off', async () => {
  const restore = stub('team', 'findUnique', () => ({ features: { photos: false } }));
  const res = mockRes();
  let nexted = false;
  try {
    await requirePhotosFeatureEnabled({ photosTeamId: 'team-1' }, res, () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FEATURE_DISABLED');
  assert.equal(res.body.feature, 'photos');
});

test('requirePhotosFeatureEnabled lets an unconfigured team through (default on)', async () => {
  const restore = stub('team', 'findUnique', () => ({ features: null }));
  let nexted = false;
  try {
    await requirePhotosFeatureEnabled({ photosTeamId: 'team-1' }, mockRes(), () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, true);
});

test('requirePhotosFeatureEnabled checks req.photosTeamId, not req.user.teamId', async () => {
  // The whole reason this exists instead of reusing requireFeature: a
  // guardian's req.user.teamId is null, but req.photosTeamId (set by
  // resolvePhotosTeam) is the team their approved link actually belongs to.
  let seenId;
  const restore = stub('team', 'findUnique', (args) => {
    seenId = args.where.id;
    return { features: null };
  });
  try {
    await requirePhotosFeatureEnabled({ user: { teamId: null }, photosTeamId: 'team-3' }, mockRes(), () => {});
  } finally {
    restore();
  }
  assert.equal(seenId, 'team-3');
});
