import type { Athlete, Module, Photo, PhotoAthlete, TagSource } from '../state/types';

// The one place the spec's "Roles and tagging rules" are enforced. Every
// tag, untag, pick and visibility decision in the workspace calls into
// this module rather than re-deriving the rule inline, so there is exactly
// one place to get it right (and one place tagRules.test.ts has to cover).

export interface Actor {
  // null for the no-account, password-gated 'volunteer' role below —
  // there's no account to carry an id.
  userId: string | null;
  isCoach: boolean;
  // Distinguishes an athlete tagging themselves ('self' tags) from a
  // guardian tagging on a linked child's behalf ('parent' tags) — both are
  // non-coach accounts, but the spec's audit trail (photo_athletes.source)
  // needs to tell them apart. 'volunteer' unlocked tagging with the
  // team's shared password instead of any account at all (see
  // backend/lib/photoTagRules.js's isVolunteer, the authoritative copy of
  // the rule below) — tagging only, never picks/opt-out/hide/upload/build.
  role: 'coach' | 'athlete' | 'guardian' | 'volunteer';
  // Athletes this account may tag or pick for on its own authority: a
  // coach needs none (isCoach covers it); an athlete or guardian account
  // lists its own linked/guarded athlete ids. Always empty for a
  // volunteer — canTagAthlete grants it a different way, and
  // canManageAthlete (picks/opt-out) deliberately does not.
  linkedAthleteIds: string[];
}

export function tagSourceFor(actor: Actor): TagSource {
  if (actor.role === 'coach') return 'coach';
  if (actor.role === 'guardian') return 'parent';
  if (actor.role === 'volunteer') return 'volunteer';
  return 'self';
}

/** Rule 1: a parent or athlete can only tag athletes linked to their own account. A volunteer may tag anyone — the password is the whole authorization. */
export function canTagAthlete(actor: Actor, athleteId: string): boolean {
  if (actor.isCoach || actor.role === 'volunteer') return true;
  return actor.linkedAthleteIds.includes(athleteId);
}

/**
 * Picks/swaps/reorders are the same "may act for this athlete" authority
 * as tagging *except* for a volunteer: the shared password unlocks
 * tagging only (matching backend/lib/photoTagRules.js's own canManageAthlete,
 * which does not get the isVolunteer bypass authorizeTag does) — picks
 * feed the printed collage and opt-out is a family's privacy choice, both
 * more consequential than adding a tag, so both stay closed to anyone who
 * got in on the password alone rather than a real linked account.
 */
export function canManageAthlete(actor: Actor, athleteId: string): boolean {
  if (actor.isCoach) return true;
  return actor.linkedAthleteIds.includes(athleteId);
}

/** Rule 3: a tag can be removed by whoever made it, or by a coach. */
export function canRemoveTag(actor: Actor, tag: PhotoAthlete): boolean {
  if (actor.isCoach) return true;
  return tag.taggedBy === actor.userId;
}

/** Only a coach may hide or delete a photo. */
export function canHidePhoto(actor: Actor): boolean {
  return actor.isCoach;
}

/**
 * Which of the three module tabs (TopBar.tsx, MobileTabBar.tsx) this actor
 * can reach — one shared rule instead of two near-identical filters.
 * 'load' (uploading) is coach-only, unchanged from before volunteers
 * existed. 'build' (collages) is open to any real account — a guardian or
 * athlete builds their own — but not to a volunteer: the shared password
 * unlocks tagging only.
 */
export function canReachModule(actor: Actor, module: Module): boolean {
  if (module === 'load') return actor.isCoach;
  if (module === 'build') return actor.role !== 'volunteer';
  return true;
}

/** Rule 5: picks must come from the athlete's own tagged photos. */
export function canPickPhoto(tagsForPhoto: PhotoAthlete[] | undefined, athleteId: string): boolean {
  return Boolean(tagsForPhoto?.some((t) => t.athleteId === athleteId));
}

/**
 * Rule 4: an untagged photo is visible to every team member so someone can
 * claim it. A photo tagged with an opted-out athlete disappears from every
 * grid except the coach's. `status: 'hidden'` (a coach's explicit hide)
 * removes it from every grid, including the coach's own tag/build grids.
 */
export function isPhotoVisible(
  photo: Photo,
  tagsForPhoto: PhotoAthlete[] | undefined,
  athletesById: Map<string, Athlete>,
  actor: Actor,
): boolean {
  if (photo.status === 'hidden') return false;
  if (photo.status !== 'ready') return false;
  if (actor.isCoach) return true;
  const taggedAthletes = tagsForPhoto ?? [];
  const hasOptedOutTag = taggedAthletes.some((t) => athletesById.get(t.athleteId)?.photosOptOut);
  return !hasOptedOutTag;
}

/** Everything upstream of a single tag toggle needs to agree it's allowed. */
export function assertCanTag(actor: Actor, athleteId: string): void {
  if (!canTagAthlete(actor, athleteId)) {
    throw new Error('This account cannot tag that athlete.');
  }
}
