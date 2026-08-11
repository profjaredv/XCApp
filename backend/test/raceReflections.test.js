const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLockAt, isPreRaceLocked, decideCanViewReflection } = require('../lib/raceReflections');

test('computeLockAt', async (t) => {
  await t.test('returns null when no results exist yet — the race has not started', () => {
    assert.equal(computeLockAt({ resultCreatedAts: [] }), null);
    assert.equal(computeLockAt({ resultCreatedAts: undefined }), null);
  });

  await t.test('returns the earliest recorded result time', () => {
    const t1 = new Date('2024-09-07T20:05:00Z');
    const t2 = new Date('2024-09-07T20:01:00Z');
    const t3 = new Date('2024-09-07T20:10:00Z');
    assert.equal(computeLockAt({ resultCreatedAts: [t1, t2, t3] }).getTime(), t2.getTime());
  });
});

test('isPreRaceLocked', async (t) => {
  await t.test('never locked with no lockAt', () => {
    assert.equal(isPreRaceLocked({ now: new Date(), lockAt: null }), false);
  });

  await t.test('locked once now is at or after lockAt', () => {
    const lockAt = new Date('2024-09-07T20:01:00Z');
    assert.equal(isPreRaceLocked({ now: new Date('2024-09-07T20:00:59Z'), lockAt }), false);
    assert.equal(isPreRaceLocked({ now: new Date('2024-09-07T20:01:00Z'), lockAt }), true);
    assert.equal(isPreRaceLocked({ now: new Date('2024-09-08T00:00:00Z'), lockAt }), true);
  });
});

test('decideCanViewReflection', async (t) => {
  await t.test('the owner can always see their own reflection, shared or not', () => {
    assert.equal(decideCanViewReflection({ viewerRole: 'ATHLETE', isOwner: true, sharedWithCoach: false, viewerLeadsAthleteGroup: false }), true);
    assert.equal(decideCanViewReflection({ viewerRole: null, isOwner: true, sharedWithCoach: false, viewerLeadsAthleteGroup: false }), true);
  });

  await t.test('unshared reflections are invisible to everyone but the owner', () => {
    assert.equal(decideCanViewReflection({ viewerRole: 'HEAD_COACH', isOwner: false, sharedWithCoach: false, viewerLeadsAthleteGroup: false }), false);
  });

  await t.test('HEAD_COACH/COACH see any shared reflection team-wide', () => {
    assert.equal(decideCanViewReflection({ viewerRole: 'HEAD_COACH', isOwner: false, sharedWithCoach: true, viewerLeadsAthleteGroup: false }), true);
    assert.equal(decideCanViewReflection({ viewerRole: 'COACH', isOwner: false, sharedWithCoach: true, viewerLeadsAthleteGroup: false }), true);
  });

  await t.test('VOLUNTEER_COACH sees a shared reflection only for an athlete in a group they lead', () => {
    assert.equal(decideCanViewReflection({ viewerRole: 'VOLUNTEER_COACH', isOwner: false, sharedWithCoach: true, viewerLeadsAthleteGroup: true }), true);
    assert.equal(decideCanViewReflection({ viewerRole: 'VOLUNTEER_COACH', isOwner: false, sharedWithCoach: true, viewerLeadsAthleteGroup: false }), false);
  });

  await t.test('ATHLETE (including a captain) never sees another athlete\'s reflection, shared or not', () => {
    assert.equal(decideCanViewReflection({ viewerRole: 'ATHLETE', isOwner: false, sharedWithCoach: true, viewerLeadsAthleteGroup: true }), false);
    assert.equal(decideCanViewReflection({ viewerRole: 'ATHLETE', isOwner: false, sharedWithCoach: false, viewerLeadsAthleteGroup: false }), false);
  });
});
