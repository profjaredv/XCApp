import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Season > Meets: a coach's multi-heat meet (4 races on one day) was
// showing as 4 unrelated cards — this tab is fed by
// MeetPerformanceMetrics, one row per race, with no awareness of the
// meet at all. See lib/meetMapping.js's groupMeetMetricsByMeet on the
// backend for the actual grouping; this file covers the frontend's
// half.
//
// Heats of one distance analyze together — same race, run in waves. A
// meet that ran MORE THAN ONE distance gets a toggle instead, because
// its heats can be listed together but never pooled: "Analyze Meet"
// builds IQR bands out of raw finishing times, and a 3200m time next to
// a 5K time reads as a fast runner, not a shorter race.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const tab = code(read('components/analytics/MeetsTab.tsx'));

describe('MeetsTab grouped-meet rendering', () => {
  it('analyzes same-distance heats as ONE meet — one card, one Analyze button, no per-heat picker', () => {
    // Heats belong to meet management (entrants/results), not here: a
    // coach opening a meet in analytics wants the whole field at once,
    // split back out by the gender/grade filters like any other meet.
    expect(tab).not.toContain('meet.heats.map((heat)');
    const actions = tab.slice(tab.indexOf('const renderMeetActions ='), tab.indexOf('return (\n    <div className="space-y-6">'));
    expect(actions).toContain('setSelectedMeet(meet)');
  });

  it('offers a distance toggle only when the meet actually ran more than one distance', () => {
    expect(tab).toContain('hasMultipleDistances(meet.heats) ? groupHeatsByDistance(meet.heats || []) : null');
    expect(tab).toContain('{distanceGroups && (');
  });

  it('keeps the plain heat-count badge for a meet whose heats all ran one distance', () => {
    expect(tab).toContain('{!distanceGroups && meet.heats && <Badge variant="secondary">{meet.heats.length} heats</Badge>}');
  });

  it('scopes pace, runner count and Analyze to the selected distance, never pooling two', () => {
    const card = tab.slice(tab.indexOf('{meets.map((meet: Meet) => {'), tab.indexOf('{/* Enhanced Meet Analysis Modal */}'));
    expect(card).toContain('heats: activeGroup.heats');
    expect(card).toContain('runners: activeGroup.runners');
    expect(card).toContain('avgPace: activeGroup.avgPace');
    expect(card).toContain('{formatPace(shown.avgPace)}');
    expect(card).toContain('{shown.runners}');
    expect(card).toContain('renderMeetActions(shown)');
  });

  it('clamps a remembered distance choice so a changed season cannot index past the toggles', () => {
    expect(tab).toContain('Math.min(heatDistanceByMeetId[meet.id] ?? 0, distanceGroups.length - 1)');
  });

  it('names the distance in the analysis header so the open meet is never ambiguous', () => {
    expect(tab).toContain('selectedMeet.distance != null && ` \u00b7 ${distanceLabel(selectedMeet.distance)}`');
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
    // `shown` IS the meet when there is no distance toggle.
    expect(tab).toContain(': meet;');
    expect(tab).toContain('renderMeetActions(shown)');
  });

  it('shares one action-rendering function between the grouped and ungrouped paths, not two copies', () => {
    const occurrences = tab.match(/const renderMeetActions = /g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
