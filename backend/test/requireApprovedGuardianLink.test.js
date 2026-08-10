// Permission-critical (rule 5). requireApprovedGuardianLink is the entire
// authorization boundary on GET /api/guardian/athletes/:athleteId — get it
// wrong and a guardian either can't see their own kid, or worse, can see
// someone else's. Stubs prisma.guardianLink.findUnique by direct property
// assignment, same reasoning as test/requireRole.test.js: Prisma's model
// delegates are Proxy-based and node:test's t.mock.method rejects them.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { requireApprovedGuardianLink } = require('../middleware/guardian');

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

function stubFindUnique(t, impl) {
  const original = prisma.guardianLink.findUnique;
  prisma.guardianLink.findUnique = async (...args) => impl(...args);
  t.after(() => { prisma.guardianLink.findUnique = original; });
}

test('requireApprovedGuardianLink', async (t) => {
  await t.test('denies when athleteId param is missing', async () => {
    const req = { user: { id: 'g1' }, params: {} };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
  });

  await t.test('passes and attaches req.guardianLink when an approved link exists', async (t) => {
    const approvedLink = { userId: 'g1', athleteId: 'a1', status: 'approved' };
    stubFindUnique(t, () => approvedLink);
    const req = { user: { id: 'g1' }, params: { athleteId: 'a1' } };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.guardianLink, approvedLink);
  });

  await t.test('denies when the link is still pending', async (t) => {
    stubFindUnique(t, () => ({ userId: 'g1', athleteId: 'a1', status: 'pending' }));
    const req = { user: { id: 'g1' }, params: { athleteId: 'a1' } };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('denies when the link was rejected', async (t) => {
    stubFindUnique(t, () => ({ userId: 'g1', athleteId: 'a1', status: 'rejected' }));
    const req = { user: { id: 'g1' }, params: { athleteId: 'a1' } };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('denies when no link exists at all for this (guardian, athlete) pair', async (t) => {
    stubFindUnique(t, () => null);
    const req = { user: { id: 'g1' }, params: { athleteId: 'someone-elses-kid' } };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('a DB error surfaces as 500, not a silent pass-through', async (t) => {
    stubFindUnique(t, () => { throw new Error('connection lost'); });
    const req = { user: { id: 'g1' }, params: { athleteId: 'a1' } };
    const res = mockRes();
    let nextCalled = false;
    await requireApprovedGuardianLink(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
  });
});
