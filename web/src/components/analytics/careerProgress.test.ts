import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Career Progress promised "compared to team, boys, and girls averages"
// while passing null for all three, so it drew a legend for series that
// never appeared. Two rules keep that from coming back: the comparison
// data is fetched, and a line is only drawn when something is behind it.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const chart = code(read('components/analytics/AthleteProgressChart.tsx'));
const modal = code(read('components/analytics/AthleteDetailModal.tsx'));

describe('career progress comparison lines', () => {
  it('actually fetches the averages instead of hardcoding null', () => {
    expect(modal).toContain('useCareerComparison');
    const block = modal.slice(modal.indexOf('const athleteProgressData'), modal.indexOf('const enhancedCareerSummary'));
    expect(block).toContain('careerComparison');
  });

  it('draws a comparison line only when there is data behind it', () => {
    for (const key of ['team5K', 'teamPace', 'boys5K', 'boysPace', 'girls5K', 'girlsPace']) {
      expect(chart, `${key} renders unconditionally`).toContain(`comparisons.${key} && (`);
    }
  });

  it('always draws the athlete, who needs no comparison to exist', () => {
    expect(chart).toContain('dataKey="athlete5K"');
    expect(chart).not.toContain('comparisons.athlete');
  });

  it('refuses to call one athlete an average', () => {
    expect(chart).toContain('MIN_FOR_AVERAGE = 2');
  });

  it('only claims a comparison in the subtitle when it is drawing one', () => {
    expect(chart).toContain('anyComparison');
  });
});
