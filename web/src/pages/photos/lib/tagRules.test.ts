import { describe, it, expect } from 'vitest';
import {
  canTagAthlete,
  canManageAthlete,
  canRemoveTag,
  canHidePhoto,
  canPickPhoto,
  isPhotoVisible,
  tagSourceFor,
  type Actor,
} from './tagRules';
import type { Athlete, Photo } from '../state/types';

const coach: Actor = { userId: 'coach-1', isCoach: true, role: 'coach', linkedAthleteIds: [] };
const parent: Actor = { userId: 'parent-1', isCoach: false, role: 'guardian', linkedAthleteIds: ['athlete-1', 'athlete-2'] };
const athleteSelf: Actor = { userId: 'athlete-1', isCoach: false, role: 'athlete', linkedAthleteIds: ['athlete-1'] };
// Unlocked tagging with the team's shared password (middleware/photosVolunteer.js
// on the backend) instead of any account — no userId, no linked athletes.
const volunteer: Actor = { userId: null, isCoach: false, role: 'volunteer', linkedAthleteIds: [] };

describe('canTagAthlete', () => {
  it('lets a coach tag any athlete', () => {
    expect(canTagAthlete(coach, 'athlete-99')).toBe(true);
  });

  it('lets a parent tag only their own linked athletes', () => {
    expect(canTagAthlete(parent, 'athlete-1')).toBe(true);
    expect(canTagAthlete(parent, 'athlete-99')).toBe(false);
  });

  it('lets a volunteer (password, no account) tag any athlete — the password is the whole authorization', () => {
    expect(canTagAthlete(volunteer, 'athlete-1')).toBe(true);
    expect(canTagAthlete(volunteer, 'athlete-99')).toBe(true);
  });
});

describe('canManageAthlete (picks/opt-out)', () => {
  it('mirrors tagging authority for a coach or a linked account', () => {
    expect(canManageAthlete(coach, 'athlete-99')).toBe(true);
    expect(canManageAthlete(parent, 'athlete-1')).toBe(true);
    expect(canManageAthlete(parent, 'athlete-99')).toBe(false);
  });

  it('does NOT extend to a volunteer, unlike canTagAthlete — picks and opt-out stay account-only', () => {
    expect(canManageAthlete(volunteer, 'athlete-1')).toBe(false);
    expect(canManageAthlete(volunteer, 'athlete-99')).toBe(false);
  });
});

describe('tagSourceFor', () => {
  it('records coach, guardian, athlete and volunteer tags with distinct provenance', () => {
    expect(tagSourceFor(coach)).toBe('coach');
    expect(tagSourceFor(parent)).toBe('parent');
    expect(tagSourceFor(athleteSelf)).toBe('self');
    expect(tagSourceFor(volunteer)).toBe('volunteer');
  });
});

describe('canRemoveTag', () => {
  it('lets a coach remove any tag', () => {
    expect(canRemoveTag(coach, { athleteId: 'a', source: 'self', taggedBy: 'parent-1' })).toBe(true);
  });

  it('lets a family account remove only its own tag', () => {
    expect(canRemoveTag(parent, { athleteId: 'athlete-1', source: 'parent', taggedBy: 'parent-1' })).toBe(true);
    expect(canRemoveTag(parent, { athleteId: 'athlete-1', source: 'coach', taggedBy: 'coach-1' })).toBe(false);
  });

  it('lets a volunteer remove another volunteer-made tag (both taggedBy: null), but not a real account\'s tag', () => {
    expect(canRemoveTag(volunteer, { athleteId: 'athlete-1', source: 'volunteer', taggedBy: null })).toBe(true);
    expect(canRemoveTag(volunteer, { athleteId: 'athlete-1', source: 'parent', taggedBy: 'parent-1' })).toBe(false);
  });
});

describe('canHidePhoto', () => {
  it('is coach-only', () => {
    expect(canHidePhoto(coach)).toBe(true);
    expect(canHidePhoto(parent)).toBe(false);
    expect(canHidePhoto(volunteer)).toBe(false);
  });
});

describe('canPickPhoto', () => {
  it('requires the athlete to already be tagged in that photo', () => {
    const tags = [{ athleteId: 'athlete-1', source: 'self' as const, taggedBy: 'parent-1' }];
    expect(canPickPhoto(tags, 'athlete-1')).toBe(true);
    expect(canPickPhoto(tags, 'athlete-2')).toBe(false);
    expect(canPickPhoto(undefined, 'athlete-1')).toBe(false);
  });
});

describe('isPhotoVisible', () => {
  const athletesById = new Map<string, Athlete>([
    ['athlete-1', { id: 'athlete-1', name: 'A', photosOptOut: false }],
    ['athlete-2', { id: 'athlete-2', name: 'B', photosOptOut: true }],
  ]);
  const photo: Photo = { id: 'p1', meetId: 'm1', takenAt: '', width: 1, height: 1, status: 'ready', thumbUrl: '', webUrl: '' };

  it('shows an untagged photo to anyone so it can be claimed', () => {
    expect(isPhotoVisible(photo, undefined, athletesById, parent)).toBe(true);
  });

  it('hides a photo tagged with an opted-out athlete from everyone but a coach', () => {
    const tags = [{ athleteId: 'athlete-2', source: 'coach' as const, taggedBy: 'coach-1' }];
    expect(isPhotoVisible(photo, tags, athletesById, parent)).toBe(false);
    expect(isPhotoVisible(photo, tags, athletesById, coach)).toBe(true);
  });

  it('hides a coach-hidden photo from everyone, coach included', () => {
    const hidden: Photo = { ...photo, status: 'hidden' };
    expect(isPhotoVisible(hidden, undefined, athletesById, coach)).toBe(false);
  });

  it('hides a pending (not yet finalized) photo from every grid', () => {
    const pending: Photo = { ...photo, status: 'pending' };
    expect(isPhotoVisible(pending, undefined, athletesById, coach)).toBe(false);
  });
});
