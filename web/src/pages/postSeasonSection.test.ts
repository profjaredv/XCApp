import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_ITEMS, navEntry } from '../lib/navigation';
import { WALKTHROUGH_STEPS } from '../lib/walkthroughContent';

// Post Season is a peer of Season, not a corner of Program: its own set of
// races, its own set of athletes, reached the same way.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/PostSeasonPage.tsx'));
const layout = code(read('components/Layout.tsx'));

describe('post season as a section', () => {
  it('sits in the coach spine, next to Season', () => {
    const spine = NAV_ITEMS.filter((i) => i.section === 'spine' && i.audience.includes('coach')).map((i) => i.key);
    expect(spine).toContain('postseason');
    expect(spine.indexOf('postseason')).toBe(spine.indexOf('season') + 1);
  });

  it('expands to its own sub-views, the way Season does', () => {
    expect(layout).toContain('POSTSEASON_TABS');
    // One collapsible component serves both, so they cannot drift apart.
    expect(layout).toContain('TabbedNavSection');
    expect(layout).not.toContain('const SeasonNavSection');
  });

  it('keeps the sidebar and the page tabs on the same values', () => {
    const navTabs = (layout.match(/const POSTSEASON_TABS[\s\S]*?\];/) ?? [''])[0];
    for (const tab of ['overview', 'athletes', 'races', 'tag']) {
      expect(navTabs, `sidebar is missing ${tab}`).toContain(`tab: '${tab}'`);
      expect(page, `page is missing ${tab}`).toContain(`<TabsTrigger value="${tab}">`);
    }
  });

  it('is in the coach tour, like every other spine screen', () => {
    expect(WALKTHROUGH_STEPS.coach.map((s) => s.navKey)).toContain('postseason');
    expect(navEntry('postseason').label).toBe('Post Season');
  });
});

describe('tagging meets', () => {
  it('stages edits and saves them together', () => {
    // A coach catching up on four imported seasons shouldn't fire a
    // request per dropdown.
    expect(page).toContain('const [pending, setPending]');
    expect(page).toContain('saveTags.mutateAsync(tags)');
  });

  it('offers the name-based suggestion as a button, never as the value', () => {
    expect(page).toContain('Use suggestion');
    expect(page).toContain('current ?? REGULAR_SEASON');
  });

  it('tells the coach what was recalculated', () => {
    expect(page).toContain('seasonsRecalculated');
  });

  it('says when a season has nothing tagged, rather than showing empty tables', () => {
    expect(page).toContain('taggedRaceCount === 0');
  });
});

describe('what the athlete view answers', () => {
  it('compares a postseason best against the season best', () => {
    // "Did they run their best race when it counted" is the question a
    // November conversation turns on.
    expect(page).toContain('peakedSec');
    expect(page).toContain('seasonBestPaceSecPerMile');
  });

  it('treats an unknown place as unknown, not as unplaced', () => {
    expect(page).toContain('race.overallPlace != null');
  });
});
