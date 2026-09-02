import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Dynamic groups are computed lists, not memberships.
//
// The whole design rests on one thing: nothing here writes to
// GroupMembership. Those rows are effective-dated history — they are how
// analytics answers "which training group was this athlete in when they ran
// that race" — and a list that reshuffles itself every Saturday would fill
// that history with churn nobody chose. The backend recomputes these from
// race results on every request; the client only renders them.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const component = code(read('components/groups/DynamicGroups.tsx'));

describe('dynamic groups', () => {
  it('only ever reads', () => {
    expect(component).not.toMatch(/useMutation|api\.(post|put|patch|delete)/);
  });

  it('asks the backend rather than ranking athletes in the browser', () => {
    // Ranking lives in backend/lib/dynamicGroups.js, where it is unit
    // tested against real race shapes; a second implementation here would
    // be a second set of answers.
    expect(component).toContain("'/groups/dynamic'");
    expect(component).not.toMatch(/\.sort\(/);
  });

  it('renders every gender list the backend sends, separately', () => {
    expect(component).toContain('group.lists');
    expect(component).toContain('listIndex');
  });

  it('shows nothing at all before there are results to draw from', () => {
    expect(component).toContain('if (groups.length === 0) return null;');
  });

  it('sits on the Groups page, above the groups a coach builds by hand', () => {
    const page = code(read('pages/GroupsPage.tsx'));
    const dynamicAt = page.indexOf('<DynamicGroups');
    const myGroupsAt = page.indexOf('myLedGroups.length > 0');
    expect(dynamicAt).toBeGreaterThan(-1);
    expect(dynamicAt).toBeLessThan(myGroupsAt);
  });
});
