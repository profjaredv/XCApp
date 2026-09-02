import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Starting next season is once-a-year configuration, so it belongs in
// Settings — not beside the season picker on the Roster page, which a
// coach opens every day. Picking a season to look at is navigation;
// creating one moves every athlete up a grade and graduates the seniors.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const card = strip(read('SeasonRolloverCard.tsx'));
const settings = strip(read('../../pages/SettingsPage.tsx'));
const roster = strip(read('../../pages/RosterPage.tsx'));

describe('season rollover', () => {
  it('is gone from the roster page', () => {
    expect(roster).not.toContain('startSeason');
    expect(roster).not.toContain('startSeasonOpen');
  });

  it('is a settings section', () => {
    expect(settings).toContain('SeasonRolloverCard');
    expect(settings).toContain("id=\"season-rollover\"");
  });

  it('is limited to coaches who can act on it, matching requireRole(FULL_COACH)', () => {
    const section = settings.slice(
      settings.lastIndexOf('{team &&', settings.indexOf('id="season-rollover"')),
      settings.indexOf('id="season-rollover"')
    );
    expect(section).toContain('isFullCoach(currentUser)');
  });

  it('still refuses to roll over a season that never happened', () => {
    expect(card).toContain('isPreseason');
    expect(card).toContain('disabled={!canStart}');
  });

  it('confirms before rolling the roster forward', () => {
    expect(card).toContain('<Dialog');
    expect(card).toContain('rosterService.startSeason(nextSeason)');
  });
});
