const test = require('node:test');
const assert = require('node:assert/strict');
const { decideCanViewAthleteJourney } = require('../lib/athleteJourneyPermissions');

test('decideCanViewAthleteJourney', async (t) => {
  await t.test('the athlete themselves can view their own journey', () => {
    assert.equal(decideCanViewAthleteJourney({ isSelf: true, isTeamCoach: false, hasApprovedGuardianLink: false }), true);
  });

  await t.test('a coach on the same team can view any athlete', () => {
    assert.equal(decideCanViewAthleteJourney({ isSelf: false, isTeamCoach: true, hasApprovedGuardianLink: false }), true);
  });

  await t.test('an approved guardian can view their linked athlete', () => {
    assert.equal(decideCanViewAthleteJourney({ isSelf: false, isTeamCoach: false, hasApprovedGuardianLink: true }), true);
  });

  await t.test('a captain viewing a TEAMMATE (not themselves) is denied — no captain special case exists', () => {
    // Captains are TeamRole.ATHLETE, not a coach role, so isTeamCoach is
    // false for them. This is the exact "captain returns 403 for anyone
    // but themselves" case from verify gate E.
    assert.equal(decideCanViewAthleteJourney({ isSelf: false, isTeamCoach: false, hasApprovedGuardianLink: false }), false);
  });

  await t.test('a pending (not yet approved) guardian is denied', () => {
    assert.equal(decideCanViewAthleteJourney({ isSelf: false, isTeamCoach: false, hasApprovedGuardianLink: false }), false);
  });

  await t.test('a coach on a DIFFERENT team is denied (isTeamCoach must already be same-team-scoped by the caller)', () => {
    assert.equal(decideCanViewAthleteJourney({ isSelf: false, isTeamCoach: false, hasApprovedGuardianLink: false }), false);
  });
});
