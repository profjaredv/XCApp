const test = require('node:test');
const assert = require('node:assert/strict');
const { decideCanViewTrainingLog } = require('../lib/trainingLogSharing');

test('decideCanViewTrainingLog: the owner always sees their own log regardless of sharing flags', () => {
  assert.equal(
    decideCanViewTrainingLog({ viewerRole: 'ATHLETE', isOwner: true, sharedWithCoach: false, sharedWithTeam: false }),
    true
  );
});

test('decideCanViewTrainingLog: an unshared log is invisible to a head coach', () => {
  assert.equal(
    decideCanViewTrainingLog({ viewerRole: 'HEAD_COACH', isOwner: false, sharedWithCoach: false, sharedWithTeam: false }),
    false
  );
});

test('decideCanViewTrainingLog: a coach-shared log is visible to HEAD_COACH and COACH', () => {
  for (const viewerRole of ['HEAD_COACH', 'COACH']) {
    assert.equal(
      decideCanViewTrainingLog({ viewerRole, isOwner: false, sharedWithCoach: true, sharedWithTeam: false }),
      true
    );
  }
});

test('decideCanViewTrainingLog: VOLUNTEER_COACH only sees a coach-shared log for an athlete in a group they lead', () => {
  assert.equal(
    decideCanViewTrainingLog({
      viewerRole: 'VOLUNTEER_COACH',
      isOwner: false,
      sharedWithCoach: true,
      sharedWithTeam: false,
      viewerLeadsAthleteGroup: false,
    }),
    false
  );
  assert.equal(
    decideCanViewTrainingLog({
      viewerRole: 'VOLUNTEER_COACH',
      isOwner: false,
      sharedWithCoach: true,
      sharedWithTeam: false,
      viewerLeadsAthleteGroup: true,
    }),
    true
  );
});

test('decideCanViewTrainingLog: sharedWithCoach never leaks a log to a teammate, only sharedWithTeam does', () => {
  assert.equal(
    decideCanViewTrainingLog({
      viewerRole: 'ATHLETE',
      isOwner: false,
      sharedWithCoach: true,
      sharedWithTeam: false,
      viewerIsTeammate: true,
    }),
    false
  );
  assert.equal(
    decideCanViewTrainingLog({
      viewerRole: 'ATHLETE',
      isOwner: false,
      sharedWithCoach: false,
      sharedWithTeam: true,
      viewerIsTeammate: true,
    }),
    true
  );
});

test('decideCanViewTrainingLog: a non-teammate athlete (different team) never qualifies even if shared with team', () => {
  assert.equal(
    decideCanViewTrainingLog({
      viewerRole: 'ATHLETE',
      isOwner: false,
      sharedWithCoach: false,
      sharedWithTeam: true,
      viewerIsTeammate: false,
    }),
    false
  );
});

test('decideCanViewTrainingLog: an unrecognized role sees nothing, even when shared', () => {
  assert.equal(
    decideCanViewTrainingLog({ viewerRole: null, isOwner: false, sharedWithCoach: true, sharedWithTeam: true }),
    false
  );
});
