import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Sorting the training-group board by average pace. The comparator and the
// pace helper have real unit tests (lib/groupSort.test.ts,
// api/groupServicePace.test.ts); this covers the wiring the page is
// responsible for.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/GroupsPage.tsx'));

describe('GroupsPage sort by average pace', () => {
  it('carries a distance-normalized average pace on every row', () => {
    expect(page).toContain('avgPaceSecPerMile: averagePaceSecPerMile(a)');
  });

  it('sorts once for the whole board, not per column', () => {
    expect(page).toContain('sortAthletes(visibleAthletes, sortMode)');
    expect(page.match(/sortAthletes\(/g) ?? []).toHaveLength(1);
  });

  it('feeds the SORTED list to the columns — sorting a list nobody renders is the easy mistake', () => {
    expect(page).toContain('athletes={sortedAthletes.filter((a) => a.gender === gender)}');
    expect(page).not.toContain('athletes={visibleAthletes.filter((a) => a.gender === gender)}');
  });

  it('defaults to name, since the board is mostly used to find one athlete', () => {
    expect(page).toContain("useState<GroupSortMode>('name')");
  });

  it('builds the control from the label map so a new mode cannot be half-added', () => {
    expect(page).toContain('Object.keys(GROUP_SORT_LABELS) as GroupSortMode[]');
  });

  it('shows the pace it sorts by, and an em dash rather than 0:00 for an unraced athlete', () => {
    expect(page).toContain("a.avgPaceSecPerMile != null ? `${formatPace(a.avgPaceSecPerMile)}` : '—'");
  });

  it('keeps the name flexible against its fixed-width siblings', () => {
    // Four shrink-0 siblings will squeeze a flex-1 name to zero width
    // rather than ellipsing it — the same trap hit on the entrants grid.
    expect(page).toContain('className="flex-1 min-w-0 truncate">{a.name}</span>');
  });
});
