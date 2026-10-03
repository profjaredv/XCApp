// lib/photosVolunteerAccess.js: the no-account entry to Photos tagging —
// a coach sets one shared password per team (Team.photosTagPassword);
// anyone who knows it gets a long-lived volunteer session. See
// middleware/photosVolunteer.js and lib/photoTagRules.js for how that
// session turns into actual (tagging-only) authority.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { safeEqual, verifyVolunteerLogin, getTagPasswordStatus, setTagPassword } = require('../lib/photosVolunteerAccess');

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

// ---------------------------------------------------------------------------
// safeEqual
// ---------------------------------------------------------------------------

test('safeEqual: true for identical strings, false for different ones (same or different length)', () => {
  assert.equal(safeEqual('go-tigers-2026', 'go-tigers-2026'), true);
  assert.equal(safeEqual('go-tigers-2026', 'go-tigers-2027'), false);
  assert.equal(safeEqual('short', 'a-lot-longer'), false);
});

// ---------------------------------------------------------------------------
// verifyVolunteerLogin
// ---------------------------------------------------------------------------

test('verifyVolunteerLogin issues a token when the password matches', async (t) => {
  const restoreTeam = stub('team', 'findUnique', (args) => {
    assert.deepEqual(args.where, { athleticTeamId: 'ehs-xc' });
    return { id: 'team-1', photosTagPassword: 'go-tigers-2026' };
  });
  let createArgs;
  const restoreSession = stub('photoVolunteerSession', 'create', (args) => {
    createArgs = args;
    return { id: 'session-1', teamId: args.data.teamId, token: args.data.token };
  });
  t.after(() => {
    restoreTeam();
    restoreSession();
  });

  const result = await verifyVolunteerLogin(prisma, { athleticTeamId: 'ehs-xc', password: 'go-tigers-2026' });

  assert.equal(result.ok, true);
  assert.equal(typeof result.token, 'string');
  assert.ok(result.token.length >= 32);
  assert.equal(createArgs.data.teamId, 'team-1');
  assert.equal(createArgs.data.token, result.token);
});

test('verifyVolunteerLogin refuses a wrong password', async (t) => {
  const restore = stub('team', 'findUnique', () => ({ id: 'team-1', photosTagPassword: 'go-tigers-2026' }));
  t.after(restore);
  const result = await verifyVolunteerLogin(prisma, { athleticTeamId: 'ehs-xc', password: 'wrong' });
  assert.deepEqual(result, { ok: false });
});

test('verifyVolunteerLogin refuses a team that never set a password, identically to a wrong one', async (t) => {
  const restore = stub('team', 'findUnique', () => ({ id: 'team-1', photosTagPassword: null }));
  t.after(restore);
  const result = await verifyVolunteerLogin(prisma, { athleticTeamId: 'ehs-xc', password: 'anything' });
  assert.deepEqual(result, { ok: false });
});

test('verifyVolunteerLogin refuses an athleticTeamId that does not exist, identically to a wrong password', async (t) => {
  const restore = stub('team', 'findUnique', () => null);
  t.after(restore);
  const result = await verifyVolunteerLogin(prisma, { athleticTeamId: 'no-such-team', password: 'anything' });
  assert.deepEqual(result, { ok: false });
});

// ---------------------------------------------------------------------------
// getTagPasswordStatus / setTagPassword
// ---------------------------------------------------------------------------

test('getTagPasswordStatus reports enabled: true only when a password is actually set', async () => {
  const restoreSet = stub('team', 'findUnique', () => ({ photosTagPassword: 'go-tigers-2026' }));
  assert.deepEqual(await getTagPasswordStatus(prisma, 'team-1'), { enabled: true });
  restoreSet();

  const restoreUnset = stub('team', 'findUnique', () => ({ photosTagPassword: null }));
  assert.deepEqual(await getTagPasswordStatus(prisma, 'team-1'), { enabled: false });
  restoreUnset();
});

test('getTagPasswordStatus never includes the password itself in the response', async (t) => {
  const restore = stub('team', 'findUnique', () => ({ photosTagPassword: 'super-secret' }));
  t.after(restore);
  const status = await getTagPasswordStatus(prisma, 'team-1');
  assert.deepEqual(Object.keys(status), ['enabled']);
});

test('setTagPassword trims and stores a new password', async (t) => {
  let updateArgs;
  const restore = stub('team', 'update', (args) => {
    updateArgs = args;
    return {};
  });
  t.after(restore);
  const result = await setTagPassword(prisma, 'team-1', '  go-tigers-2026  ');
  assert.deepEqual(updateArgs.where, { id: 'team-1' });
  assert.equal(updateArgs.data.photosTagPassword, 'go-tigers-2026');
  assert.deepEqual(result, { enabled: true });
});

test('setTagPassword(null) clears the password', async (t) => {
  let updateArgs;
  const restore = stub('team', 'update', (args) => {
    updateArgs = args;
    return {};
  });
  t.after(restore);
  const result = await setTagPassword(prisma, 'team-1', null);
  assert.equal(updateArgs.data.photosTagPassword, null);
  assert.deepEqual(result, { enabled: false });
});
