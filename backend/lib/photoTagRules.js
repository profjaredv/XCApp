// The backend's own copy of the spec's "Roles and tagging rules" — the
// authoritative one. web/src/pages/photos/lib/tagRules.ts enforces the same
// rules client-side for instant optimistic UI, but a client check is a
// courtesy; this module is what actually decides whether a write lands.
//
// Deliberately NOT a port of the frontend's single-`role`-per-actor model:
// a real account can be both an athlete (self) AND a guardian of a sibling
// at the same time, and tagging rule 2 ("self" vs "parent" vs "coach") is
// per ATHLETE being tagged, not per account. authorizeTag below resolves
// the source for the specific athleteId in question instead of assuming
// one source for the whole request.

/**
 * @typedef {Object} PhotoActor
 * @property {string|null} userId - null for a volunteer actor (no account)
 * @property {boolean} isCoach
 * @property {boolean} [isPhotosAdmin] - an invited, non-coach account with full
 *   Load/Tag/Build authority (lib/photosAccess.js's PhotosAdmin) — everywhere this
 *   module checks isCoach for Add/Tag/Build it checks isPhotosAdmin too, EXCEPT
 *   canHidePhoto, which stays coach-only on purpose (hide/delete, collage branding,
 *   and the tag-password itself are settings-tier, not granted by this).
 * @property {boolean} [isVolunteer] - unlocked the Tag module with the team's shared
 *   password instead of an account (middleware/photosVolunteer.js) — tagging only,
 *   never hide/delete/upload/build, and never widens canManageAthlete (picks,
 *   opt-out): those stay off-limits unless isCoach, isPhotosAdmin, or genuinely linked.
 * @property {string|null} selfAthleteId - this account's own linked Athlete, if any
 * @property {string[]} guardianAthleteIds - athletes this account has an approved GuardianLink for
 * @property {string[]} linkedAthleteIds - selfAthleteId + guardianAthleteIds, flattened (visibility/pick authority)
 */

/** Rule 1 + 2: who may tag athleteId, and what source that tag records. */
function authorizeTag(actor, athleteId) {
  if (actor.isCoach) return { allowed: true, source: 'COACH' };
  if (actor.isPhotosAdmin) return { allowed: true, source: 'PHOTOS_ADMIN' };
  if (actor.isVolunteer) return { allowed: true, source: 'VOLUNTEER' };
  if (actor.selfAthleteId === athleteId) return { allowed: true, source: 'SELF' };
  if (actor.guardianAthleteIds.includes(athleteId)) return { allowed: true, source: 'PARENT' };
  return { allowed: false, source: null };
}

/** Picks/opt-out share the same "may act for this athlete" authority as tagging. */
function canManageAthlete(actor, athleteId) {
  return actor.isCoach || actor.isPhotosAdmin || actor.linkedAthleteIds.includes(athleteId);
}

/** Rule 3: a tag can be removed by whoever made it, by a coach, or by a Photos Admin. */
function canRemoveTag(actor, tag) {
  return actor.isCoach || actor.isPhotosAdmin || tag.taggedBy === actor.userId;
}

/** Only a coach may hide, unhide, or delete a photo — settings-tier, never granted by a Photos Admin invite. */
function canHidePhoto(actor) {
  return actor.isCoach;
}

module.exports = {
  authorizeTag,
  canManageAthlete,
  canRemoveTag,
  canHidePhoto,
};
