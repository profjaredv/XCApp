// lib/photoTagRules.js is the backend's authoritative copy of the build
// spec's "Roles and tagging rules" — see web/src/pages/photos/lib/tagRules.ts
// for the client-side copy that drives optimistic UI. These two are
// deliberately NOT the same shape (see that file's own header comment):
// the backend resolves a tag's source per-athlete, not per-whole-actor,
// because one real account can be both an athlete (self) and a guardian
// of a sibling at once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeTag, canManageAthlete, canRemoveTag, canHidePhoto } = require('../lib/photoTagRules');

const coach = { userId: 'coach-1', isCoach: true, selfAthleteId: null, guardianAthleteIds: [], linkedAthleteIds: [] };
const selfAthlete = {
  userId: 'athlete-1',
  isCoach: false,
  selfAthleteId: 'athlete-1',
  guardianAthleteIds: [],
  linkedAthleteIds: ['athlete-1'],
};
const guardian = {
  userId: 'parent-1',
  isCoach: false,
  selfAthleteId: null,
  guardianAthleteIds: ['athlete-2', 'athlete-3'],
  linkedAthleteIds: ['athlete-2', 'athlete-3'],
};
// Rare but real: an older sibling on the roster whose parent also tags for
// a younger sibling — self for one athlete, parent for the other, same
// account. This is exactly what the per-athlete resolution exists for.
const mixed = {
  userId: 'athlete-4',
  isCoach: false,
  selfAthleteId: 'athlete-4',
  guardianAthleteIds: ['athlete-5'],
  linkedAthleteIds: ['athlete-4', 'athlete-5'],
};

test('a coach may tag any athlete, and it records as coach', () => {
  assert.deepEqual(authorizeTag(coach, 'athlete-99'), { allowed: true, source: 'COACH' });
});

test('an athlete may tag themselves, and it records as self', () => {
  assert.deepEqual(authorizeTag(selfAthlete, 'athlete-1'), { allowed: true, source: 'SELF' });
});

test('an athlete may not tag a teammate who is not their own linked athlete', () => {
  assert.deepEqual(authorizeTag(selfAthlete, 'athlete-2'), { allowed: false, source: null });
});

test('a guardian may tag their linked athletes, and it records as parent', () => {
  assert.deepEqual(authorizeTag(guardian, 'athlete-2'), { allowed: true, source: 'PARENT' });
  assert.deepEqual(authorizeTag(guardian, 'athlete-3'), { allowed: true, source: 'PARENT' });
});

test('a guardian may not tag an athlete they have no link to', () => {
  assert.deepEqual(authorizeTag(guardian, 'athlete-99'), { allowed: false, source: null });
});

test('one account resolves self vs parent per athlete, not once for the whole request', () => {
  assert.deepEqual(authorizeTag(mixed, 'athlete-4'), { allowed: true, source: 'SELF' });
  assert.deepEqual(authorizeTag(mixed, 'athlete-5'), { allowed: true, source: 'PARENT' });
  assert.deepEqual(authorizeTag(mixed, 'athlete-6'), { allowed: false, source: null });
});

test('canManageAthlete (picks/opt-out) mirrors tagging authority', () => {
  assert.equal(canManageAthlete(coach, 'athlete-99'), true);
  assert.equal(canManageAthlete(selfAthlete, 'athlete-1'), true);
  assert.equal(canManageAthlete(selfAthlete, 'athlete-2'), false);
  assert.equal(canManageAthlete(guardian, 'athlete-2'), true);
  assert.equal(canManageAthlete(guardian, 'athlete-99'), false);
});

test('a tag can be removed by whoever made it, or by a coach', () => {
  const tagMadeByGuardian = { athleteId: 'athlete-2', taggedBy: 'parent-1', source: 'PARENT' };
  assert.equal(canRemoveTag(guardian, tagMadeByGuardian), true);
  assert.equal(canRemoveTag(coach, tagMadeByGuardian), true);
  assert.equal(canRemoveTag(selfAthlete, tagMadeByGuardian), false);
});

test('only a coach may hide a photo', () => {
  assert.equal(canHidePhoto(coach), true);
  assert.equal(canHidePhoto(guardian), false);
  assert.equal(canHidePhoto(selfAthlete), false);
});
