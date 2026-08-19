// Guards the identity question POST /api/athletes/accept-invite has to
// answer before it links an athlete row to a user account: "is the
// currently-authenticated session actually the person this invite was
// meant for?" `authenticate` alone only proves *someone* is signed in — a
// super admin who opens an invite link while already logged in (e.g. to
// preview it, or from a shared browser) would otherwise get silently
// converted into that athlete: their own account's teamId reassigned, a
// TeamMember(ATHLETE) row created, Athlete.userId pointed at them. That's
// the exact bug this module exists to close.
function decideCanAcceptAthleteInvite({ isSuperAdmin, inviteAthleteId, existingLinkedAthleteId }) {
  if (isSuperAdmin) {
    return {
      allowed: false,
      reason: 'Super admin accounts can\'t accept athlete invites on themselves. Use impersonation or preview-as-athlete to view an athlete\'s account instead.',
    };
  }
  if (existingLinkedAthleteId && existingLinkedAthleteId !== inviteAthleteId) {
    return {
      allowed: false,
      reason: 'This account is already linked to a different athlete profile.',
    };
  }
  return { allowed: true };
}

module.exports = { decideCanAcceptAthleteInvite };
