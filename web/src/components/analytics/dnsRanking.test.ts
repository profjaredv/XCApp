import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// "entries with 0:00 were showing up as top runners" after a metrics
// recalculation — every view that ranks/sorts results by time needs to
// filter or order through isRankableFinish/compareByFinishTime
// (lib/raceResultRanking.ts), never a bare `a.time - b.time`, since a
// DNS/DNF/DQ row can carry a leftover nonzero time from before it was
// marked a non-finish.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const meetsTab = code(read('components/analytics/MeetsTab.tsx'));
const raceViz = code(read('components/analytics/RaceVisualization.tsx'));
const swarmChart = code(read('components/analytics/SwarmChart.tsx'));

describe('MeetsTab rankings exclude non-finishers', () => {
  it('filters through isRankableFinish before building the meet-detail stats (top 7/15, IQR, scoring)', () => {
    expect(meetsTab).toContain("from '@/lib/raceResultRanking'");
    const fn = meetsTab.slice(meetsTab.indexOf('const calculateMeetStats ='), meetsTab.indexOf('// Prepare swarmplot data'));
    expect(fn).toContain('meet.results.filter(isRankableFinish)');
    expect(fn).not.toMatch(/meet\.results\.map\(/);
  });

  it('filters through isRankableFinish before building the swarmplot/scatter data too', () => {
    const fn = meetsTab.slice(meetsTab.indexOf('const swarmplotData = useMemo'), meetsTab.indexOf('// Race place needs'));
    expect(fn).toContain('selectedMeetWithResults.results.filter(isRankableFinish)');
  });

  it('no longer declares its own local copy of this rule — one shared implementation', () => {
    expect(meetsTab).not.toContain('function isRankableFinish');
  });
});

describe('RaceVisualization and SwarmChart order/filter non-finishers correctly', () => {
  it('sorts the full results table with compareByFinishTime, not a bare time subtraction', () => {
    expect(raceViz).toContain("from '@/lib/raceResultRanking'");
    expect(raceViz).toContain('.sort(compareByFinishTime)');
  });

  it('shows the status word (DNS/DNF/DQ) instead of a misleading 0:00 for a non-finish row', () => {
    expect(raceViz).toContain("result.status && result.status !== 'FINISHED' ? result.status : formatTime(result.time ?? 0)");
  });

  it('SwarmChart filters to rankable finishers itself — a distribution chart of DNS/DNF times means nothing', () => {
    expect(swarmChart).toContain("from '@/lib/raceResultRanking'");
    expect(swarmChart).toContain('allResults.filter(isRankableFinish)');
  });
});
