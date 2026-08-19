// The team's original owner (Team.coachUid) is always a HEAD_COACH, but —
// per middleware/auth.js's hasTeamRole comment — may not have their own
// TeamMember row (older teams, or one never backfilled). Merging the two
// sources here, in one place, means "how many coaches does this team
// have" and "list the coaches" (routes/teams.js's setup.hasStaff and
// routes/today.js's GET /staff) never disagree or double-count the owner.
//
// owner: { id, name, email } | null. teamMembers: [{ userId, role, name,
// email }] — active, coaching-role rows only; callers filter that before
// calling in. A TeamMember row for the same user always wins over the
// synthesized owner entry, since it's the more specific, current record.
function mergeStaffRoster(owner, teamMembers) {
  const byUserId = new Map();
  if (owner) {
    byUserId.set(owner.id, { userId: owner.id, name: owner.name, email: owner.email, role: 'HEAD_COACH' });
  }
  for (const m of teamMembers) {
    byUserId.set(m.userId, { userId: m.userId, name: m.name, email: m.email, role: m.role });
  }
  return [...byUserId.values()];
}

module.exports = { mergeStaffRoster };
