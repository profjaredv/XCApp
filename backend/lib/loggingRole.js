// Resolves the coarse role bucket a usage row is filed under (PageView,
// UiSwitchEvent). Two lookups, both already made elsewhere for other
// reasons, and nothing about the user is returned beyond the bucket:
//
//   1. The caller's TeamMember.role on their current team, with the same
//      owner-fast-path-then-membership precedence as hasTeamRole
//      (middleware/auth.js) and GET /users/me. req.user never carries this
//      — authenticate() attaches the User row, not the membership — so
//      reading req.user.teamRole directly (as POST /page-views used to)
//      filed every coach and athlete under "other".
//   2. Only when there is no team role: whether they hold an approved
//      GuardianLink. One count query, per docs/leadpack-new-ui-trial.md
//      §1.2.
const { roleForLogging } = require('./pageViewLogging');

async function resolveTeamRole(prisma, user) {
  if (!user?.teamId) return null;
  if (user.team?.coachUid === user.id) return 'HEAD_COACH';
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: user.teamId, userId: user.id } },
  });
  return membership?.active ? membership.role : null;
}

async function resolveLoggingRole(prisma, user) {
  if (user?.isSuperAdmin) return roleForLogging({ isSuperAdmin: true });
  const teamRole = await resolveTeamRole(prisma, user);
  let isGuardian = false;
  if (!teamRole && user?.id) {
    const approved = await prisma.guardianLink.count({
      where: { userId: user.id, status: 'approved' },
    });
    isGuardian = approved > 0;
  }
  return roleForLogging({ teamRole, isSuperAdmin: false, isGuardian });
}

module.exports = { resolveTeamRole, resolveLoggingRole };
