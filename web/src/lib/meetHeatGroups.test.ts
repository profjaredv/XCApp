import { describe, it, expect } from 'vitest';
import { groupHeatsByDistance, hasMultipleDistances } from './meetHeatGroups';

const heat = (id: string, distance: number | null, runners: number, avgPace: number, hasSplits = false) => ({
  id,
  name: 'Bellevue Cross Country Invitational',
  distance,
  runners,
  avgPace,
  hasSplits,
});

describe('groupHeatsByDistance', () => {
  it('keeps same-distance heats together — they are one race run in waves', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 40, 400), heat('b', 5000, 20, 430)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].heats.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('separates distances a coach cannot compare', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 65, 412), heat('b', 3200, 16, 394)]);
    expect(groups.map((g) => g.label)).toEqual(['5K', '3200m']);
  });

  it('preserves the order distances first appear', () => {
    const groups = groupHeatsByDistance([heat('a', 3200, 5, 400), heat('b', 5000, 5, 400), heat('c', 3200, 5, 420)]);
    expect(groups.map((g) => g.distance)).toEqual([3200, 5000]);
    expect(groups[0].heats.map((h) => h.id)).toEqual(['a', 'c']);
  });

  it('weights pace by field size rather than averaging averages', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 90, 400), heat('b', 5000, 10, 500)]);
    // A naive average would say 450; 90 runners at 400 dominate.
    expect(groups[0].avgPace).toBeCloseTo(410, 6);
    expect(groups[0].runners).toBe(100);
  });

  it('sums runners within a distance', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 65, 412), heat('b', 3200, 16, 394)]);
    expect(groups.map((g) => g.runners)).toEqual([65, 16]);
  });

  it('reports splits for a distance when ANY of its heats has them', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 10, 400, false), heat('b', 5000, 10, 400, true)]);
    expect(groups[0].hasSplits).toBe(true);
  });

  it('drops no heat — every one lands in exactly one group', () => {
    const heats = [heat('a', 5000, 1, 400), heat('b', 3200, 1, 400), heat('c', null, 1, 400), heat('d', 5000, 1, 400)];
    const ids = groupHeatsByDistance(heats).flatMap((g) => g.heats.map((h) => h.id));
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('groups heats with no recorded distance together rather than guessing one', () => {
    const groups = groupHeatsByDistance([heat('a', null, 5, 400), heat('b', null, 5, 400)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].distance).toBeNull();
    expect(groups[0].label).toBe('Distance unknown');
  });

  it('falls back to a heat\'s own pace when nobody finished', () => {
    const groups = groupHeatsByDistance([heat('a', 5000, 0, 415)]);
    expect(groups[0].avgPace).toBe(415);
  });
});

describe('hasMultipleDistances', () => {
  it('is false for a meet with no heats at all', () => {
    expect(hasMultipleDistances(undefined)).toBe(false);
  });

  it('is false for heats that all ran the same distance — no toggle to offer', () => {
    expect(hasMultipleDistances([heat('a', 5000, 40, 400), heat('b', 5000, 20, 430)])).toBe(false);
  });

  it('is true only when the distances genuinely differ', () => {
    expect(hasMultipleDistances([heat('a', 5000, 65, 412), heat('b', 3200, 16, 394)])).toBe(true);
  });
});
