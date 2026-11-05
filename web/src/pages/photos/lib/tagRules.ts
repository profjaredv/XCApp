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
  // 'photos_admin' is the opposite: a real, invited account (backend's
  // PhotosAdmin) with full Load/Tag/Build authority, EXCEPT hiding or
  // deleting a photo — that stays coach-only regardless (canHidePhoto
  // below never grants it).
  role: 'coach' | 'athlete' | 'guardian' | 'volunteer' | 'photos_admin';
  // Athletes this account may tag or pick for on its own authority: a
  // coach needs none (isCoach covers it); an athlete or guardian account
  // lists its own linked/guarded athlete ids. Always empty for a
  // volunteer — canTagAthlete grants it a different way, and
  // canManageAthlete (picks/opt-out) deliberately does not.
  linkedAthleteIds: string[];
  // Groups (backend/prisma's Group, any type) this account is a
  // GroupLeader for — most commonly a team captain. Grants a READ-ONLY
  // capability only (see canViewGroupCoverage below): seeing that group's
  // roster/coverage in the Tag and Build left panels. It never widens
  // canTagAthlete/canManageAthlete — leading a group is not the same
  // authority as being linked to an athlete.
  ledGroupIds: string[];
}

/**
 * A coach or Photos Admin browses the whole roster (Build's athlete
 * switcher, Tag's arm-an-athlete / all-meets view) instead of landing on
 * just their own linked athlete(s) — the "family" experience. Shared by
 * BuildLeftPanel.tsx, TagLeftPanel.tsx, TopBar.tsx, and
 * useWorkspaceKeyboard.ts so the four don't drift on who counts.
 */
export function canBrowseFullRoster(actor: Actor): boolean {
  return actor.isCoach || actor.role === 'photos_admin';
}

/** A coach or Photos Admin sees every group; a captain (GroupLeader) sees only their own. */
export function canViewGroupCoverage(actor: Actor, groupId: string): boolean {
  if (canBrowseFullRoster(actor)) return true;
  return actor.ledGroupIds.includes(groupId);
}

export function tagSourceFor(actor: Actor): TagSource {
  if (actor.role === 'coach') return 'coach';
  if (actor.role === 'photos_admin') return 'photos_admin';
  if (actor.role === 'guardian') return 'parent';
  if (actor.role === 'volunteer') return 'volunteer';
  return 'self';
}

/** Rule 1: a parent or athlete can only tag athletes linked to their own account. A volunteer or Photos Admin may tag anyone. */
export function canTagAthlete(actor: Actor, athleteId: string): boolean {
  if (actor.isCoach || actor.role === 'volunteer' || actor.role === 'photos_admin') return true;
  return actor.linkedAthleteIds.includes(athleteId);
}

/**
 * Picks/swaps/reorders are the same "may act for this athlete" authority
 * as tagging *except* for a volunteer: the shared password unlocks
 * tagging only (matching backend/lib/photoTagRules.js's own canManageAthlete,
 * which does not get the isVolunteer bypass authorizeTag does) — picks
 * feed the printed collage and opt-out is a family's privacy choice, both
 * more consequential than adding a tag, so both stay closed to anyone who
 * got in on the password alone rather than a real linked account. A
 * Photos Admin's account IS real (unlike a volunteer), so it gets this too.
 */
export function canManageAthlete(actor: Actor, athleteId: string): boolean {
  if (actor.isCoach || actor.role === 'photos_admin') return true;
  return actor.linkedAthleteIds.includes(athleteId);
}

/** Rule 3: a tag can be removed by whoever made it, by a coach, or by a Photos Admin. */
export function canRemoveTag(actor: Actor, tag: PhotoAthlete): boolean {
  if (actor.isCoach || actor.role === 'photos_admin') return true;
  return tag.taggedBy === actor.userId;
}

/** Only a coach may hide or delete a photo. */
export function canHidePhoto(actor: Actor): boolean {
  return actor.isCoach;
}

/**
 * Which of the three module tabs (TopBar.tsx, MobileTabBar.tsx) this actor
 * can reach — one shared rule instead of two near-identical filters.
 * 'load' (uploading) is coach or Photos Admin, unchanged in spirit from
 * before volunteers existed — a volunteer's shared password still never
 * reaches it. 'slideshow' stays coach-only (not part of the Load/Tag/Build
 * authority a Photos Admin invite grants). 'build' (collages) is open to
 * any real account — a guardian or athlete builds their own — but not to
 * a volunteer: the shared password unlocks tagging only.
 */
export function canReachModule(actor: Actor, module: Module): boolean {
  if (module === 'load') return canBrowseFullRoster(actor);
  if (module === 'slideshow') return actor.isCoach;
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
 * grid except a coach's or Photos Admin's. `status: 'hidden'` (a coach's
 * explicit hide) removes it from every grid, including those two.
 */
export function isPhotoVisible(
  photo: Photo,
  tagsForPhoto: PhotoAthlete[] | undefined,
  athletesById: Map<string, Athlete>,
  actor: Actor,
): boolean {
  if (photo.status === 'hidden') return false;
  if (photo.status !== 'ready') return false;
  if (actor.isCoach || actor.role === 'photos_admin') return true;
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
