import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ZONE_KEY_PREFIX,
  TEAM_ZONE_PREFIX,
  zoneKeyFor,
  findZoneByKey,
  selectableZones,
  zoneDisplayName,
} from './paceZoneLookup';
import { MCMILLAN_ZONES, type PaceZoneDefinition } from './paceZones';

const teamDis: PaceZoneDefinition = {
  id: 'uuid-changes-every-save', abbreviation: 'DIS', name: 'Distance', notes: null,
  ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 120, offsetSlowSec: 180,
  rangeDistanceAMeters: null, rangeDistanceBMeters: null,
};

describe('zoneKeyFor', () => {
  it('keys a default zone by its constant id', () => {
    const vo2 = MCMILLAN_ZONES.find((z) => z.abbreviation === 'VO2')!;
    expect(zoneKeyFor(vo2)).toBe('mcm-vo2');
    expect(zoneKeyFor(vo2).startsWith(DEFAULT_ZONE_KEY_PREFIX)).toBe(true);
  });

  it('keys a team zone by abbreviation, NOT by row id', () => {
    // The whole point: PaceZone rows are deleted and recreated on every
    // save, so the uuid is different every time. A session keyed on it
    // would be orphaned the first time a coach edited an unrelated zone.
    expect(zoneKeyFor(teamDis)).toBe(`${TEAM_ZONE_PREFIX}DIS`);
    expect(zoneKeyFor(teamDis)).toBe('team:DIS');
    expect(zoneKeyFor(teamDis)).not.toContain(teamDis.id);
  });

  it('gives the same key after a save changes the row id', () => {
    const afterSave = { ...teamDis, id: 'a-completely-different-uuid' };
    expect(zoneKeyFor(afterSave)).toBe(zoneKeyFor(teamDis));
  });
});

describe('findZoneByKey', () => {
  it('finds a default zone with no team zones loaded', () => {
    expect(findZoneByKey('mcm-tempo', [])?.name).toBe('Tempo');
  });

  it('finds a team zone by abbreviation', () => {
    expect(findZoneByKey('team:DIS', [teamDis])?.name).toBe('Distance');
  });

  it('returns null for a zone the team deleted', () => {
    // The session must still render — that is what the stored label is
    // for — but there is no live rule to compute a pace from.
    expect(findZoneByKey('team:DIS', [])).toBeNull();
  });

  it('returns null for a malformed or legacy key rather than guessing', () => {
    for (const bad of ['', 'threshold', 'interval', 'repetition', 'mcm-nope', 'DIS']) {
      expect(findZoneByKey(bad, [teamDis]), bad).toBeNull();
    }
  });

  it('does not confuse a team zone with a default sharing an abbreviation', () => {
    // Both the defaults and this team have a zone abbreviated "T".
    const teamT: PaceZoneDefinition = { ...teamDis, abbreviation: 'T', name: 'Our Threshold' };
    expect(findZoneByKey('team:T', [teamT])?.name).toBe('Our Threshold');
    expect(findZoneByKey('mcm-tempo', [teamT])?.name).toBe('Tempo');
  });
});

describe('selectableZones', () => {
  it('offers the team\'s own zones first, then the defaults', () => {
    const list = selectableZones([teamDis]);
    expect(list[0].group).toBe('team');
    expect(list[0].definition.name).toBe('Distance');
    expect(list.slice(1).every((z) => z.group === 'standard')).toBe(true);
  });

  it('offers every default zone, not just the fast ones', () => {
    // The old picker offered three. A coach running 6 x 1000m at steady
    // state is not making a mistake.
    expect(selectableZones([]).length).toBe(MCMILLAN_ZONES.length);
  });

  it('gives every option a unique key', () => {
    const keys = selectableZones([teamDis]).map((z) => z.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('zoneDisplayName', () => {
  it('prefers the live definition, so a rename shows through', () => {
    const renamed = { ...teamDis, name: 'Long Run' };
    expect(zoneDisplayName('team:DIS', [renamed], 'Distance')).toBe('Long Run');
  });

  it('falls back to the stored label when the zone is gone', () => {
    expect(zoneDisplayName('team:DIS', [], 'Distance')).toBe('Distance');
  });

  it('falls back to the key itself when there is nothing else', () => {
    // Ugly on purpose. A session that shows a raw key is a visible
    // problem; one that shows a plausible wrong name is not.
    expect(zoneDisplayName('team:GONE', [], null)).toBe('team:GONE');
  });
});
