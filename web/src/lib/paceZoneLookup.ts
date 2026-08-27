// Resolving the pace zone a SAVED thing refers to.
//
// An interval session stores which zone its suggested paces come from. It
// must not store a PaceZone.id: saving the zone set is a delete-then-insert
// (see backend/routes/paceZones.js), so every custom zone gets a fresh uuid
// on every save, and a session holding an id would be orphaned the first
// time a coach edited an unrelated zone.
//
// What IS stable:
//   'mcm-vo2'   a default zone, by its constant id
//   'team:DIS'  a team's own zone, by abbreviation — unique per team
//               (enforced by the DB) and unchanged by a save
//
// The backend half of this vocabulary is lib/paceZoneRules.js, and
// backend/test/paceZoneKeys.test.js reads MCMILLAN_ZONES to fail the build
// if the two drift.

import { MCMILLAN_ZONES, type PaceZoneDefinition } from './paceZones';

export const DEFAULT_ZONE_KEY_PREFIX = 'mcm-';
export const TEAM_ZONE_PREFIX = 'team:';

/** The stable key for a zone, whichever kind it is. */
export function zoneKeyFor(zone: PaceZoneDefinition): string {
  if (zone.id.startsWith(DEFAULT_ZONE_KEY_PREFIX)) return zone.id;
  return `${TEAM_ZONE_PREFIX}${zone.abbreviation}`;
}

/**
 * The live definition a key points at, or null.
 *
 * Null is a normal outcome, not an error: a coach can delete a zone that
 * past sessions still reference. Those sessions keep their stored label and
 * simply show no suggested pace, which is honest — there is no longer a
 * rule to compute one from.
 */
export function findZoneByKey(
  key: string,
  teamZones: PaceZoneDefinition[]
): PaceZoneDefinition | null {
  if (!key) return null;
  if (key.startsWith(TEAM_ZONE_PREFIX)) {
    const abbreviation = key.slice(TEAM_ZONE_PREFIX.length);
    if (!abbreviation) return null;
    return teamZones.find((z) => z.abbreviation === abbreviation) ?? null;
  }
  return MCMILLAN_ZONES.find((z) => z.id === key) ?? null;
}

export type SelectableZone = {
  key: string;
  /** Which section of the picker this belongs under. */
  group: 'team' | 'standard';
  definition: PaceZoneDefinition;
};

/**
 * Everything a coach can pick for a session: their team's zones first
 * (those are the words they actually use), then the defaults.
 *
 * Every zone is offered. The old picker listed three, because Daniels'
 * Easy and Marathon paces have no meaningful repeat split — but a coach
 * running 6 x 1000m at steady state is not making a mistake, and a coach
 * who defined their own vocabulary should see all of it.
 */
export function selectableZones(teamZones: PaceZoneDefinition[]): SelectableZone[] {
  return [
    ...teamZones.map((definition) => ({ key: zoneKeyFor(definition), group: 'team' as const, definition })),
    ...MCMILLAN_ZONES.map((definition) => ({ key: zoneKeyFor(definition), group: 'standard' as const, definition })),
  ];
}

/**
 * What to call this session's zone on screen.
 *
 * The live definition wins, so renaming a zone shows through on sessions
 * still using it. `storedLabel` is the snapshot taken when the session was
 * created and covers the zone having been deleted since. The raw key is the
 * last resort — deliberately ugly, because a session showing a raw key is a
 * visible problem a coach can report, while one showing a plausible but
 * wrong name is not.
 */
export function zoneDisplayName(
  key: string,
  teamZones: PaceZoneDefinition[],
  storedLabel: string | null
): string {
  return findZoneByKey(key, teamZones)?.name ?? storedLabel ?? key;
}
