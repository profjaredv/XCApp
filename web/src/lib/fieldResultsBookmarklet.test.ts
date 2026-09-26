import { describe, it, expect, beforeAll } from 'vitest';
import { __TEST_ONLY_BOOKMARKLET_SOURCE as SOURCE } from './fieldResultsBookmarklet';

// A confirmed real case (Ellensburg, 9/25/26): a meet's results/all page
// rendered as the single-race .result-row layout (no Mens/Womens Results
// header at all) instead of the Angular .event-block layout the old
// gender detection required. Every one of that meet's 552 finishers
// uploaded with gender blank — which backend/lib/gender.js's
// normalizeGender turns into null, which backend/lib/meetScoring.js's
// `stats[division.gender]` lookup can't bucket into either side — the
// whole division silently vanished from team scoring and Top 20%-of-
// field, even though the athlete-name matching and every other column
// were fine.
//
// genderFromLabel is the fix: fall back to whatever the division/section
// label itself spells out ("Boys Varsity", "Girls JV") when there's no
// separate header. This extracts and evaluates the actual function body
// out of the bookmarklet's source string — a `javascript:` bookmarklet
// never runs under Node otherwise — so its regex behavior is verified for
// real, not just checked for presence as a string.

let genderFromLabel: (label: string) => string;

beforeAll(() => {
  const start = SOURCE.indexOf('function genderFromLabel(label) {');
  const end = SOURCE.indexOf('\n    }', start) + '\n    }'.length;
  expect(start).toBeGreaterThan(-1);
  const fnSource = SOURCE.slice(start, end);
  // Extracting a bookmarklet's own function body to actually execute it,
  // not accepting external input.
  genderFromLabel = new Function(`${fnSource}\nreturn genderFromLabel;`)();
});

describe('genderFromLabel (extracted from the field-results bookmarklet)', () => {
  it('reads "Womens Results" / "Mens Results" headers, the results/all layout\'s own wording', () => {
    expect(genderFromLabel('Womens Results')).toBe('F');
    expect(genderFromLabel('Mens Results')).toBe('M');
  });

  it('checks women/girl before men/boy — "Women" contains "men" as a substring', () => {
    expect(genderFromLabel('Womens Results')).toBe('F');
    expect(genderFromLabel('Girls Varsity')).toBe('F');
  });

  it('falls back to a division label that spells gender out on its own — the actual fix', () => {
    expect(genderFromLabel('Boys Varsity')).toBe('M');
    expect(genderFromLabel('Girls JV')).toBe('F');
    expect(genderFromLabel('Boys Gold Varsity')).toBe('M');
  });

  it('is case-insensitive', () => {
    expect(genderFromLabel('BOYS VARSITY')).toBe('M');
    expect(genderFromLabel('girls jv')).toBe('F');
  });

  it('returns empty, not a guess, for a label with no gender word in it at all', () => {
    expect(genderFromLabel('Varsity')).toBe('');
    expect(genderFromLabel('')).toBe('');
  });
});
