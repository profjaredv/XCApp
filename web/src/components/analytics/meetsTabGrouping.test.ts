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

  it('lists each heat with its own runners/pace, not just the combined meet-level numbers', () => {
    const heatsBlock = tab.slice(tab.indexOf('meet.heats.map((heat)'), tab.indexOf('renderMeetActions(meet)'));
    expect(heatsBlock).toContain('{heat.runners} runners');
    expect(heatsBlock).toContain('formatPace(heat.avgPace)');
  });

  it('scopes every action (Analyze/Splits/Chart) to the heat\'s own race id, never the group\'s Meet id', () => {
    // renderMeetActions builds /race/${target.id}/splits and
    // meetService.getMeet(target.id) — if a heat row ever passed the
    // outer `meet` through unmodified, those would hit the Meet's id
    // instead of a real race id and 404.
    const heatCall = tab.slice(tab.indexOf('renderMeetActions({'), tab.indexOf('})\n                    </div>\n                  ))}'));
    expect(heatCall).toContain('id: heat.id');
    expect(heatCall).toContain('heats: undefined');
  });

  it('falls back to the single-race path unchanged when nothing is grouped', () => {
    expect(tab).toContain('renderMeetActions(meet)');
  });

  it('shares one action-rendering function between the grouped and ungrouped paths, not two copies', () => {
    const occurrences = tab.match(/const renderMeetActions = /g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
