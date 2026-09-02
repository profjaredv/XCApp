import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { matchesQuery } from '@/lib/athleteSearch';

// Handing out and collecting uniforms is a boys-then-girls job on a
// hundred-name roster, and the rest of the time the coach is hunting for
// the one athlete standing in front of them. Both athlete-listing tabs get
// the same two controls.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/EquipmentPage.tsx'));

describe('equipment athlete filters', () => {
  it('puts the same control on both athlete-listing tabs', () => {
    expect(page.match(/<AthleteFilters/g) ?? []).toHaveLength(2);
  });

  it('composes with the group filter instead of replacing it', () => {
    const grid = page.slice(page.indexOf('const visibleRoster'), page.indexOf('if (isLoading)'));
    expect(grid).toContain('memberIds');
    expect(grid).toContain('genderFilter');
    expect(grid).toContain('matchesQuery');
  });

  it('searches the roster name and the preferred name', () => {
    // A team calling Margaret "Maggie" must be findable by either.
    expect(page).toMatch(/a\.name.*a\.preferredName/);
    expect(page).toMatch(/group\.athleteName.*group\.fullName/);
    expect(matchesQuery('Margaret Mays Maggie', 'maggie')).toBe(true);
    expect(matchesQuery('Margaret Mays Maggie', 'margaret')).toBe(true);
  });

  it('lists outstanding items as rows, not a card per athlete', () => {
    // Thirty outstanding jerseys was thirty card headers and borders to
    // scroll past to do the one thing the tab is for.
    const report = page.slice(page.indexOf('const OutstandingReport'), page.indexOf('const InventoryList'));
    expect(report).not.toContain('<Card');
    expect(report).toContain('Check in');
  });

  it('only spins the row being checked in', () => {
    const report = page.slice(page.indexOf('const OutstandingReport'), page.indexOf('const InventoryList'));
    expect(report).toContain('returningId === item.assignmentId');
    expect(report).not.toContain('disabled={returnItem.isPending}');
  });

  it('says which filter emptied the list', () => {
    expect(page).toContain('No athlete matching');
    expect(page).toContain('No athletes match those filters.');
  });
});
