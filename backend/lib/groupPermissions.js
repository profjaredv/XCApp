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

// LeadPack Track & Field handoff, Section 1b: the staff-side version of the
// over-broad-access problem decideCanManageGroup already closes for
// volunteer coaches, applied along a different axis — sport, not group
// leadership. TeamMember.sport is null (unrestricted, every pre-existing
// row) or narrows a membership to one sport ("XC" | "TRACK"); this is the
// one place that narrowing gets enforced, reused by every season-scoped
// write (Season, Group, PracticePlan, Meet, results import, TrackResult
// writes — per the doc's own list) rather than re-checked ad hoc per route.
//
// Deliberately a SEPARATE, narrower gate than decideCanManageGroup, not a
// merge of the two: role (can this TeamRole touch this kind of resource at
// all) and sport (can this membership touch THIS season's sport) are
// orthogonal questions. A route composes this with whatever role/
// group-leadership check it already has — e.g. a VOLUNTEER_COACH scoped to
// TRACK and leading a specific group needs both this to return true AND
// decideCanManageGroup to return true, same as a HEAD_COACH scoped to
// TRACK needs only this (their role already clears decideCanManageGroup
// unconditionally).
//
// isOwner bypasses the same way it does in decideCanManageGroup above —
// the team's literal owner (Team.coachUid) isn't guaranteed a TeamMember
// row at all (the same owner-fast-path middleware/auth.js's hasTeamRole
// already relies on), so there's no `sport` column to check; owning the
// team means owning every sport it runs.
function decideCanAccessSportScopedResource({ isOwner, membership, resourceSport }) {
  if (isOwner) return true;
  if (!membership?.active) return false;
  return membership.sport == null || membership.sport === resourceSport;
}

module.exports = { decideCanManageGroup, decideCanAccessSportScopedResource };
