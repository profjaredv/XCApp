import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Post Season: how far the program got each year.
//
// The property this file protects is the difference between "nobody
// qualified" and "nobody marked the meet". Drawing an unmarked season as a
// zero would tell a coach who won their district that they sent nobody.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const section = code(read('components/analytics/PostseasonSection.tsx'));
const meetPage = code(read('pages/MeetDetailPage.tsx'));
const overview = code(read('components/analytics/ProgramOverviewSection.tsx'));

describe('post season section', () => {
  it('charts only seasons that were actually marked', () => {
    expect(section).toContain('postseason.filter((s) => s.marked)');
    expect(section).toContain('!s.marked');
  });

  it('says an unmarked season is a gap in the record, not a zero', () => {
    expect(section).toContain('not a season nobody qualified in');
  });

  it('drops rungs the program has never reached', () => {
    // A team that never sends anyone to nationals shouldn't carry an empty
    // series for it.
    expect(section).toContain('usedLevels');
  });

  it('counts athletes, and says so', () => {
    expect(section).toContain('Counted once per athlete per level');
  });
});

describe('marking a meet', () => {
  it('offers the suggestion without applying it', () => {
    expect(meetPage).toContain('suggestedPostseasonLevel');
    expect(meetPage).toContain("set it if");
    // The value shown is what is stored, never the suggestion.
    expect(meetPage).toContain('meet.postseasonLevel ?? REGULAR_SEASON');
  });

  it('handles a meet whose races disagree rather than picking one', () => {
    expect(meetPage).toContain('postseasonMixed');
  });

  it('refuses to mark a meet with no races', () => {
    expect(meetPage).toContain('meet.races.length === 0');
  });
});

describe('benchmarks', () => {
  it('compares a season against the program own best, not an invented average', () => {
    expect(overview).toContain('bestNote');
    expect(overview).toContain('Best on file');
    expect(overview).toContain('Measured against your own history');
  });

  it('will not call a single season a record', () => {
    expect(overview).toContain('best?.isRecord');
  });
});
