import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Season > Meets: a coach's multi-heat meet (4 races linked to one real
// Meet via Schedule > Meets > Import) was showing as 4 unrelated cards —
// this tab is fed by MeetPerformanceMetrics, one row per race, with no
// awareness of Race.meetId at all. See lib/meetMapping.js's
// groupMeetMetricsByMeet on the backend for the actual grouping; this
// file covers the frontend's half — rendering a grouped entry as one
// card with a heat picker, since each heat's own analytics (IQR bands,
// scoring, splits) can't meaningfully merge with another heat's.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const tab = code(read('components/analytics/MeetsTab.tsx'));

describe('MeetsTab grouped-meet rendering', () => {
  it('labels a grouped entry with its heat count', () => {
    expect(tab).toContain('{meet.heats && <Badge variant="secondary">{meet.heats.length} heats</Badge>}');
  });

  it('analyzes a multi-heat meet as ONE meet — one card, one Analyze button, no per-heat picker', () => {
    // Heats belong to meet management (entrants/results), not here: a
    // coach opening a meet in analytics wants the whole field at once,
    // split back out by the gender/grade filters like any other meet.
    expect(tab).not.toContain('meet.heats.map((heat)');
    const actions = tab.slice(tab.indexOf('const renderMeetActions ='), tab.indexOf('return (\n    <div className="space-y-6">'));
    expect(actions).toContain('setSelectedMeet(meet)');
  });

  it('merges every heat\'s results into one pool when the meet is opened', () => {
    const fetchEffect = tab.slice(tab.indexOf('if (!selectedMeet) {'), tab.indexOf('// Create athlete lookup map'));
    expect(fetchEffect).toContain('selectedMeet.heats?.length ? selectedMeet.heats.map((h) => h.id) : [selectedMeet.id]');
    expect(fetchEffect).toContain('races.flatMap((r) => r.results || [])');
  });

  it('keeps each heat\'s own division scoring rather than averaging heats together', () => {
    const fetchEffect = tab.slice(tab.indexOf('if (!selectedMeet) {'), tab.indexOf('// Create athlete lookup map'));
    expect(fetchEffect).toContain('races.flatMap((r) => r.scoring || [])');
  });

  it('drops the per-race splits button for a multi-heat meet — splits are entered per race, from the meet page', () => {
    const actions = tab.slice(tab.indexOf('const renderMeetActions ='), tab.indexOf('return (\n    <div className="space-y-6">'));
    expect(actions).toContain('raceIds.length === 1 && (');
    expect(actions).toContain('`/race/${raceIds[0]}/splits`');
  });

  it('falls back to the single-race path unchanged when nothing is grouped', () => {
    expect(tab).toContain('renderMeetActions(meet)');
  });

  it('shares one action-rendering function between the grouped and ungrouped paths, not two copies', () => {
    const occurrences = tab.match(/const renderMeetActions = /g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
