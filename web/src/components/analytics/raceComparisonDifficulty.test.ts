import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Course Difficulty card on RaceComparisonTab — top-7 team finishers'
// pace at a course vs their own average pace elsewhere that season, from
// GET /enhanced-performance/course-difficulty/:meetName (see
// lib/courseDifficulty.js for the athlete-relative reasoning).

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const tab = code(read('components/analytics/RaceComparisonTab.tsx'));

describe('RaceComparisonTab course difficulty', () => {
  it('fetches the difficulty rating when a meet is selected, as its own request', () => {
    expect(tab).toContain('/enhanced-performance/course-difficulty/${encodedMeetName}');
    expect(tab).toContain('setCourseDifficulty(response.data.data)');
  });

  it('resets to null when nothing is selected, same as the existing meet comparison fetch', () => {
    const fn = tab.slice(tab.indexOf('const fetchCourseDifficulty'), tab.indexOf('fetchCourseDifficulty();'));
    expect(fn).toContain('if (!selectedMeet) {');
    expect(fn).toContain('setCourseDifficulty(null)');
  });

  it('formats the delta with a sign and calls out a small gap as noise, not a real reading', () => {
    const fn = tab.slice(tab.indexOf('const formatDifficulty ='), tab.indexOf('interface RaceComparisonTabProps'));
    expect(fn).toContain("if (secPerMile == null) return 'Not enough data yet'");
    expect(fn).toContain('Math.abs(secPerMile) < 3');
    expect(fn).toContain('sec/mi harder');
    expect(fn).toContain('sec/mi easier');
  });

  it('shows the per-athlete breakdown so a coach can see why the rating is what it is', () => {
    expect(tab).toContain('s.topSeven.map((t) =>');
    expect(tab).toContain('t.athleteName');
  });

  it('explains a low-confidence season (few or no runners with a baseline) rather than presenting it as equally solid', () => {
    expect(tab).toContain('had another race that season');
  });
});
