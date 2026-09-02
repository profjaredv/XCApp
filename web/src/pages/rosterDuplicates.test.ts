import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Three screens, one underlying failure: a returning athlete whose races
// are in a past season is filtered out of the roster, looks missing, gets
// added by hand, and their history is orphaned on the old record.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const roster = code(read('pages/RosterPage.tsx'));
const groups = code(read('pages/GroupsPage.tsx'));

describe('adding someone who is already on the team', () => {
  it('offers the existing record instead of creating a second one', () => {
    expect(roster).toContain("code === 'ATHLETE_EXISTS'");
    expect(roster).toContain('putExistingOnRoster');
    expect(roster).toContain('careerRaceCount');
  });

  it('still allows a genuine second athlete with the same name', () => {
    expect(roster).toContain('allowDuplicate: true');
  });

  it('will not let the plain Add button push past the warning', () => {
    expect(roster).toContain('|| !!nameConflict');
  });
});

describe('merging duplicates', () => {
  it('fetches every athlete the team has ever had, not the filtered view', () => {
    // The row a coach comes here to merge is by definition the one the
    // roster is hiding — that is what made the athlete look missing.
    const dialog = roster.slice(roster.indexOf('const MergeAthletesDialog'));
    expect(dialog).toContain('activeOnly: false');
    expect(dialog).toContain("'merge-candidates'");
  });

  it('labels each option with career races, not this season', () => {
    const dialog = roster.slice(roster.indexOf('const MergeAthletesDialog'));
    expect(dialog).toContain('careerRaceCount ?? a.raceCount');
    expect(dialog).toContain('career race');
  });
});

describe('the groups board', () => {
  it('waits for memberships before deciding anyone is unassigned', () => {
    // An enabled-but-not-yet-fetching query reports isLoading === false,
    // which rendered the whole roster as Unassigned until the per-group
    // member requests came back.
    expect(groups).toContain('membersFetched');
    expect(groups).toContain('const membersPending = groupIds.length > 0 && !membersFetched');
    expect(groups).toContain('groupsLoading || membersPending || rosterLoading');
    expect(groups).not.toContain('isLoading: membersLoading } = useAllGroupMembers');
  });
});
