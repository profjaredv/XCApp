const test = require('node:test');
const assert = require('node:assert/strict');
const { decideCanAcceptAthleteInvite } = require('../lib/athleteInvites');

test('decideCanAcceptAthleteInvite', async (t) => {
  await t.test('a super admin cannot accept an athlete invite on their own account', () => {
    const result = decideCanAcceptAthleteInvite({
      isSuperAdmin: true,
      inviteAthleteId: 'athlete-1',
      existingLinkedAthleteId: null,
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /super admin/i);
  });

  await t.test('a super admin is blocked even if they have no existing link at all', () => {
    // The exact reported bug: an already-signed-in super admin clicks an
    // invite link meant for a real athlete and gets silently linked.
    const result = decideCanAcceptAthleteInvite({
      isSuperAdmin: true,
      inviteAthleteId: 'athlete-1',
      existingLinkedAthleteId: null,
    });
    assert.equal(result.allowed, false);
  });

  await t.test('a regular user already linked to a DIFFERENT athlete is blocked', () => {
    const result = decideCanAcceptAthleteInvite({
      isSuperAdmin: false,
      inviteAthleteId: 'athlete-2',
      existingLinkedAthleteId: 'athlete-1',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /already linked/i);
  });

  await t.test('re-accepting the SAME invite/athlete they are already linked to is allowed (idempotent)', () => {
    const result = decideCanAcceptAthleteInvite({
      isSuperAdmin: false,
      inviteAthleteId: 'athlete-1',
      existingLinkedAthleteId: 'athlete-1',
    });
    assert.equal(result.allowed, true);
  });

  await t.test('a regular user with no existing link can accept', () => {
    const result = decideCanAcceptAthleteInvite({
      isSuperAdmin: false,
      inviteAthleteId: 'athlete-1',
      existingLinkedAthleteId: null,
    });
    assert.equal(result.allowed, true);
  });
});
