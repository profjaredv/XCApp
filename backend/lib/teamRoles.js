// Who can do what on a team, stated once.
//
// The policy, in the product owner's words: a COACH is equal to a
// HEAD_COACH except for deleting data. Before this it was spelled out
// route by route, so the two roles had drifted apart in thirteen places
// nobody could see at once — coaches could not edit team settings, start a
// season, save pace zones, export, or manage staff, and no single file said
// so. Naming the sets here means the policy is one thing to read and one
// thing to change.
//
// Use these instead of literal arrays in requireRole(). test/roleMatrix
// .test.js walks every route and fails on a literal, so this cannot quietly
// come apart again.

/**
 * Head coach and coach, equally. The default for anything a coach does:
 * roster, results entry, meets, groups, practices, attendance, settings,
 * pace zones, staff, export.
 */
const FULL_COACH = ['HEAD_COACH', 'COACH'];

/**
 * Head coach only. DELETING DATA, and nothing else — the one exception to
 * the rule above.
 *
 * "Deleting data" means irreversibly destroying records a season's worth of
 * work went into: clearing a season, deleting results, deleting or merging
 * an athlete. It does NOT mean routine editing that happens to remove a
 * row — taking someone off this season's roster is roster management, and
 * they can be added straight back.
 */
const DESTRUCTIVE = ['HEAD_COACH'];

/**
 * Every kind of coach, volunteers included. Read-only access to the things
 * a volunteer supervising a workout genuinely needs.
 *
 * Volunteers are deliberately NOT equal to a coach: their write access is
 * scoped to the specific groups they lead (Group/GroupLeader), which is a
 * data-layer check inside a handler, not something a route-level gate can
 * express. See the TeamRole comment in schema.prisma.
 */
const ANY_COACH = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'];

/**
 * Anyone on the team, athletes included. For the handful of screens an
 * athlete is meant to read too — the meet list, say. Not a permission
 * level so much as "signed in and on this team", and every handler using
 * it still filters what it returns by who is asking.
 */
const ANY_TEAM_MEMBER = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH', 'ATHLETE'];

module.exports = { FULL_COACH, DESTRUCTIVE, ANY_COACH, ANY_TEAM_MEMBER };
