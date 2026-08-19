// Permission-related (rule 4: write the test before the fix). requireActivePlan
// (lib/entitlements.js) is the F4 checkout gate — the whole point of
// Workstream F is that join codes and invites are unreachable until a team's
// plan is 'active', so this is a security-relevant boundary, not a UX one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireActivePlan } = require('../lib/entitlements');

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

test('requireActivePlan: blocks with 402 when team.plan is pending', () => {
  const req = { user: { team: { plan: 'pending' } } };
  const res = mockRes();
  let nextCalled = false;
  requireActivePlan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 402);
});

test('requireActivePlan: blocks with 402 when team.plan is past_due', () => {
  const req = { user: { team: { plan: 'past_due' } } };
  const res = mockRes();
  let nextCalled = false;
  requireActivePlan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 402);
});

test('requireActivePlan: blocks with 402 when there is no team at all', () => {
  const req = { user: {} };
  const res = mockRes();
  let nextCalled = false;
  requireActivePlan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 402);
});

test('requireActivePlan: calls next() when team.plan is active', () => {
  const req = { user: { team: { plan: 'active' } } };
  const res = mockRes();
  let nextCalled = false;
  requireActivePlan(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
