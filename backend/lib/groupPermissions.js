// T2 (Team Management handoff): pure decision logic for "can this user
// manage this group" — a head/paid coach can manage any group on their
// team; a volunteer coach can only manage a group they actually lead. Kept
// DB-free and separate from routes/groups.js so it's directly testable
// (rule 5: permission logic gets a test before it gets trusted).
function decideCanManageGroup({ isOwner, membership, isGroupLeader }) {
  if (isOwner) return true;
  if (membership?.active && ['HEAD_COACH', 'COACH'].includes(membership.role)) return true;
  if (membership?.active && membership.role === 'VOLUNTEER_COACH') return Boolean(isGroupLeader);
  return false;
}

// T3: the same decision, extended for practice-plan rows, which can also
// be team-wide (groupId null — strength sessions, meetings). A volunteer
// coach's authority is scoped to specific groups they lead, never to
// team-wide rows, so groupId === null collapses straight to "head/paid
// coach only" regardless of isGroupLeader.
function decideCanManagePracticePlanRow({ groupId, isOwner, membership, isGroupLeader }) {
  if (groupId == null) {
    if (isOwner) return true;
    return Boolean(membership?.active && ['HEAD_COACH', 'COACH'].includes(membership.role));
  }
  return decideCanManageGroup({ isOwner, membership, isGroupLeader });
}

module.exports = { decideCanManageGroup, decideCanManagePracticePlanRow };
