import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Groups page is the longest screen in the app: the training board,
// the groups a coach leads, captain and custom groups, and the four
// computed lists. Every section shuts, and what a coach opened is
// remembered per device.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/GroupsPage.tsx'));

describe('groups page sections', () => {
  it('collapses every section, not just the computed ones', () => {
    for (const id of ['my-groups', 'board', 'captain-custom']) {
      expect(page, `${id} does not collapse`).toContain(`id="${id}"`);
    }
  });

  it('remembers what the coach opened', () => {
    expect(page).toContain("useExpandedSections('xc_groups_open_sections'");
  });

  it('starts with the board open — it is why the screen exists', () => {
    expect(page).toContain("['board', 'my-groups']");
  });

  it('keeps the athlete search inside the board it filters', () => {
    const board = page.slice(page.indexOf('id="board"'), page.indexOf('id="captain-custom"'));
    expect(board).toContain('Find an athlete…');
    expect(board).toContain('<GenderColumn');
  });
});

describe('the shared collapsible section', () => {
  it('only defaults a section open the first time, never over a stored choice', () => {
    // A section a coach deliberately closed must not reappear open.
    const hook = code(read('hooks/useExpandedSections.ts'));
    expect(hook).toContain('raw ? JSON.parse(raw) : defaultOpen');
  });
});
