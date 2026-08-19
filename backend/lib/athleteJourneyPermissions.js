// Workstream E1: who can load GET /api/analytics/athlete/:athleteId/journey.
// Three-way OR (self, team coach, approved guardian) — not expressible as a
// flat requireRole list, so it's a pure decision function instead, tested
// directly, same pattern as lib/groupPermissions.js.
//
// Captains get no special case here at all: they're TeamRole.ATHLETE like
// any other athlete, so isSelf covers viewing their own journey and
// isTeamCoach is false for them — viewing anyone else's is rejected by the
// same path a non-captain athlete would be. Verify gate E's "a captain
// account returns 403 on the journey endpoint for anyone but themselves"
// falls out of that automatically, not from a captain-specific check.
function decideCanViewAthleteJourney({ isSelf, isTeamCoach, hasApprovedGuardianLink }) {
  return Boolean(isSelf || isTeamCoach || hasApprovedGuardianLink);
}

module.exports = { decideCanViewAthleteJourney };
