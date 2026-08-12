// Permission-critical logic (rule 5: write the test before the fix for
// anything arithmetic OR permission-related). requireRole is the sole
// authorization gate for every mutating coach/staff route in the app —
// getting its owner-fast-path / role-list / active-flag logic wrong is a
// direct security bug, not a UX one.
//
// Stubs prisma.teamMember.findUnique by direct property assignment rather
// than node:test's t.mock.method: Prisma's model delegates are Proxy-based,
// and Object.getOwnPropertyDescriptor(prisma.teamMember, 'findUnique')
// reports value: undefined even though the property works fine — which
// t.mock.method rejects with "must be a method. Received undefined". Plain
// assignment (and manual restore) works because it just shadows the
// Proxy-trapped property with a real own one.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { requireRole } = require('../middleware/auth');

function mockRes() {
  const res = {
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
  return res;
}

function stubFindUnique(t, impl) {
  const original = prisma.teamMember.findUnique;
  let callCount = 0;
  prisma.teamMember.findUnique = async (...args) => {
    callCount++;
    return impl(...args);
  };
  t.after(() => {
    prisma.teamMember.findUnique = original;
  });
  return { callCount: () => callCount };
}

test('requireRole', async (t) => {
  await t.test('a super admin actively impersonating a team passes any role check without a DB lookup', async (t) => {
    const findUnique = stubFindUnique(t, () => {
      throw new Error('should not be called — the impersonation bypass should short-circuit');
    });
    const req = { user: { id: 'admin1', teamId: 'someTeam', isSuperAdmin: true, isImpersonating: true } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(findUnique.callCount(), 0);
  });

  await t.test('isSuperAdmin alone, with no active impersonation, does not bypass anything', async (t) => {
    stubFindUnique(t, () => null);
    const req = { user: { id: 'admin1', teamId: 'someTeam', isSuperAdmin: true, isImpersonating: false } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('denies when the caller has no teamId', async () => {
    const req = { user: { id: 'u1', teamId: null } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('team owner passes without a DB lookup when HEAD_COACH is allowed', async (t) => {
    const findUnique = stubFindUnique(t, () => {
      throw new Error('should not be called — owner fast path should short-circuit');
    });
    const req = { user: { id: 'u1', teamId: 't1', team: { coachUid: 'u1' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH', 'COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(findUnique.callCount(), 0);
  });

  await t.test('team owner still needs a DB check when HEAD_COACH is not in the allowed list', async (t) => {
    stubFindUnique(t, () => null);
    const req = { user: { id: 'u1', teamId: 't1', team: { coachUid: 'u1' } } };
    const res = mockRes();
    let nextCalled = false;
    // Nobody would actually write requireRole(['VOLUNTEER_COACH']) for an
    // owner-relevant route, but this proves the fast path is scoped to
    // HEAD_COACH specifically, not "is the owner" in general.
    await requireRole(['VOLUNTEER_COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('an active TeamMember with an allowed role passes', async (t) => {
    stubFindUnique(t, () => ({ role: 'COACH', active: true }));
    const req = { user: { id: 'u2', teamId: 't1', team: { coachUid: 'someone-else' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH', 'COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  await t.test('an inactive TeamMember is denied even with a matching role', async (t) => {
    stubFindUnique(t, () => ({ role: 'COACH', active: false }));
    const req = { user: { id: 'u2', teamId: 't1', team: { coachUid: 'someone-else' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH', 'COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('a role not in the allowed list is denied — VOLUNTEER_COACH does not satisfy a COACH-only route', async (t) => {
    stubFindUnique(t, () => ({ role: 'VOLUNTEER_COACH', active: true }));
    const req = { user: { id: 'u3', teamId: 't1', team: { coachUid: 'someone-else' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH', 'COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('no TeamMember row at all is denied', async (t) => {
    stubFindUnique(t, () => null);
    const req = { user: { id: 'u4', teamId: 't1', team: { coachUid: 'someone-else' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['ATHLETE'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('a DB error surfaces as 500, not a silent pass-through', async (t) => {
    stubFindUnique(t, () => { throw new Error('connection lost'); });
    const req = { user: { id: 'u5', teamId: 't1', team: { coachUid: 'someone-else' } } };
    const res = mockRes();
    let nextCalled = false;
    await requireRole(['HEAD_COACH'])(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
  });
});
