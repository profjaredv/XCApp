import type { User } from '@/types';

// The frontend half of backend/lib/teamRoles.js. Same policy, same names:
// a COACH is equal to a HEAD_COACH except for deleting data.
//
// Always ask these rather than reading currentUser.role. That field is the
// sticky legacy hint — middleware/auth.js sets it to 'coach' for
// VOLUNTEER_COACH too, and it can lag behind or disagree with the team
// membership entirely. TeamMember.role, exposed as teamRole, is what every
// server-side gate actually checks, so it is what the UI should check.

/** Head coach or coach: everything except deleting data. */
export function isFullCoach(user: User | null | undefined): boolean {
  return user?.teamRole === 'HEAD_COACH' || user?.teamRole === 'COACH';
}

/** Any coach, volunteers included. */
export function isAnyCoach(user: User | null | undefined): boolean {
  return isFullCoach(user) || user?.teamRole === 'VOLUNTEER_COACH';
}

/** Head coach only — deleting data, and nothing else. */
export function canDeleteData(user: User | null | undefined): boolean {
  return user?.teamRole === 'HEAD_COACH';
}

/**
 * A super admin counts as a coach only while actually impersonating a team.
 * requireRole works the same way, so gating on isSuperAdmin alone shows
 * buttons that can only ever 403.
 */
export function isImpersonatingAdmin(user: User | null | undefined): boolean {
  return Boolean(user?.isSuperAdmin && user?.isImpersonating);
}
