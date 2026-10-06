const test = require('node:test');
const assert = require('node:assert/strict');
const { decideCanManageGroup, decideCanAccessSportScopedResource } = require('../lib/groupPermissions');

test('decideCanManageGroup', async (t) => {
  await t.test('the team owner can always manage any group', () => {
    assert.equal(decideCanManageGroup({ isOwner: true, membership: null, isGroupLeader: false }), true);
  });

  await t.test('an active HEAD_COACH can manage any group', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: true, role: 'HEAD_COACH' }, isGroupLeader: false }),
      true
    );
  });

  await t.test('an active COACH can manage any group', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: true, role: 'COACH' }, isGroupLeader: false }),
      true
    );
  });

  await t.test('an active VOLUNTEER_COACH can manage a group they lead', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: true, role: 'VOLUNTEER_COACH' }, isGroupLeader: true }),
      true
    );
  });

  await t.test('an active VOLUNTEER_COACH cannot manage a group they do NOT lead', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: true, role: 'VOLUNTEER_COACH' }, isGroupLeader: false }),
      false
    );
  });

  await t.test('an ATHLETE can never manage a group, even one they somehow "lead"', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: true, role: 'ATHLETE' }, isGroupLeader: true }),
      false
    );
  });

  await t.test('an inactive HEAD_COACH cannot manage a group', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: false, role: 'HEAD_COACH' }, isGroupLeader: false }),
      false
    );
  });

  await t.test('an inactive VOLUNTEER_COACH cannot manage a group even if they lead it', () => {
    assert.equal(
      decideCanManageGroup({ isOwner: false, membership: { active: false, role: 'VOLUNTEER_COACH' }, isGroupLeader: true }),
      false
    );
  });

  await t.test('no membership and not the owner: denied', () => {
    assert.equal(decideCanManageGroup({ isOwner: false, membership: null, isGroupLeader: false }), false);
  });
});

test('decideCanAccessSportScopedResource', async (t) => {
  await t.test('the team owner can always access any sport, with no membership row', () => {
    assert.equal(
      decideCanAccessSportScopedResource({ isOwner: true, membership: null, resourceSport: 'TRACK' }),
      true
    );
  });

  await t.test('a sport: null membership (every pre-existing row) is unrestricted across sports', () => {
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: true, sport: null },
        resourceSport: 'TRACK',
      }),
      true
    );
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: true, sport: null },
        resourceSport: 'XC',
      }),
      true
    );
  });

  await t.test('a TRACK-scoped membership can access a TRACK resource', () => {
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: true, sport: 'TRACK' },
        resourceSport: 'TRACK',
      }),
      true
    );
  });

  await t.test('a TRACK-scoped membership is denied an XC resource — the whole point of Section 1b', () => {
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: true, sport: 'TRACK' },
        resourceSport: 'XC',
      }),
      false
    );
  });

  await t.test('an XC-scoped membership is denied a TRACK resource', () => {
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: true, sport: 'XC' },
        resourceSport: 'TRACK',
      }),
      false
    );
  });

  await t.test('an inactive membership is denied even when the sport matches', () => {
    assert.equal(
      decideCanAccessSportScopedResource({
        isOwner: false,
        membership: { active: false, sport: 'TRACK' },
        resourceSport: 'TRACK',
      }),
      false
    );
  });

  await t.test('no membership and not the owner: denied', () => {
    assert.equal(
      decideCanAccessSportScopedResource({ isOwner: false, membership: null, resourceSport: 'TRACK' }),
      false
    );
  });
});
