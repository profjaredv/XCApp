import { describe, it, expect } from 'vitest';
import { formatPaceRange, distanceLabel, formatOffset, describeRule, repTimeSec, formatRepTime, isRepeatZone, formatRepTargetRange, explainRepTarget } from './paceFormat';
import { resolvePaceZone, type PaceZoneDefinition } from './paceZones';

const base: PaceZoneDefinition = {
  id: 'x', abbreviation: 'X', name: 'X', notes: null,
  ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 60, offsetSlowSec: 90,
  rangeDistanceAMeters: null, rangeDistanceBMeters: null,
};

describe('formatPaceRange', () => {
  it('shows a range with one "/mi", not two', () => {
    expect(formatPaceRange({ fastSecPerMile: 385, slowSecPerMile: 415, isSinglePace: false }))
      .toBe('6:25 - 6:55/mi');
  });
  it('collapses a zero-width range to a single pace', () => {
    expect(formatPaceRange({ fastSecPerMile: 378, slowSecPerMile: 378, isSinglePace: true }))
      .toBe('6:18/mi');
  });
});

describe('distanceLabel', () => {
  it('names the distances a coach says out loud', () => {
    expect(distanceLabel(1609)).toBe('mile');
    expect(distanceLabel(1600)).toBe('mile');
    expect(distanceLabel(3218)).toBe('2 mile');
    expect(distanceLabel(5000)).toBe('5K');
    expect(distanceLabel(800)).toBe('800m');
  });
  it('falls back honestly for an unnamed distance', () => {
    expect(distanceLabel(2500)).toBe('2500m');
    expect(distanceLabel(7000)).toBe('7K');
  });
});

describe('formatOffset', () => {
  it('signs the offset the way a coach writes it', () => {
    expect(formatOffset(120)).toBe('+2:00');
    expect(formatOffset(90)).toBe('+1:30');
    expect(formatOffset(-45)).toBe('-0:45');
    expect(formatOffset(0)).toBe('even');
  });
  it('pads seconds', () => {
    expect(formatOffset(65)).toBe('+1:05');
  });
});

describe('describeRule', () => {
  it('states an offset rule in the coach\'s own terms', () => {
    expect(describeRule(base)).toBe('mile pace +1:00 to +1:30');
  });
  it('collapses an exact offset', () => {
    expect(describeRule({ ...base, offsetFastSec: 30, offsetSlowSec: 30, refDistanceMeters: 5000 }))
      .toBe('5K pace +0:30');
  });
  it('states a range rule shortest-first regardless of entry order', () => {
    const range: PaceZoneDefinition = {
      ...base, ruleType: 'RANGE',
      refDistanceMeters: null, offsetFastSec: null, offsetSlowSec: null,
      rangeDistanceAMeters: 5000, rangeDistanceBMeters: 3218,
    };
    expect(describeRule(range)).toBe('2 mile to 5K race pace');
  });
  it('says so when a rule is incomplete rather than inventing one', () => {
    expect(describeRule({ ...base, refDistanceMeters: null })).toBe('Incomplete rule');
  });
});

describe('repTimeSec', () => {
  it('gives an 800m rep time at a known pace', () => {
    // 6:00/mi over 800m is just under half of six minutes.
    expect(repTimeSec(360, 800)).toBeCloseTo(178.95, 1);
  });
  it('gives a mile rep the pace itself', () => {
    expect(repTimeSec(360, 1609.34)).toBeCloseTo(360, 6);
  });
});

describe('formatRepTime', () => {
  it('drops the tenth that formatTime carries', () => {
    // 1:17.4 as a target is false precision — it came out of a model, not
    // a stopwatch.
    expect(formatRepTime(77.4)).toBe('1:17');
    expect(formatRepTime(80.7)).toBe('1:21');
  });
  it('pads seconds and handles the minute boundary', () => {
    expect(formatRepTime(65)).toBe('1:05');
    expect(formatRepTime(119.6)).toBe('2:00');
    expect(formatRepTime(9)).toBe('0:09');
  });
});

describe('isRepeatZone', () => {
  // An 18:00 5K runner races 5:48/mi.
  const fiveK = 348;
  it('includes the zones you actually run as reps', () => {
    expect(isRepeatZone(311, fiveK)).toBe(true); // Speed 5:11
    expect(isRepeatZone(337, fiveK)).toBe(true); // VO2 5:37
    expect(isRepeatZone(367, fiveK)).toBe(true); // Tempo 6:07
    expect(isRepeatZone(392, fiveK)).toBe(true); // Steady State 6:32
  });
  it('excludes continuous-run zones', () => {
    expect(isRepeatZone(437, fiveK)).toBe(false); // Easy 7:17
    expect(isRepeatZone(512, fiveK)).toBe(false); // Recovery 8:32
  });
  it('scales with the athlete, so a slower runner still gets rep targets', () => {
    // A 25:00 5K runner races 8:03/mi; their interval pace is around
    // 7:30/mi, which any absolute cutoff tuned to a fast runner would
    // have thrown away.
    const slowFiveK = 483;
    expect(isRepeatZone(450, slowFiveK)).toBe(true);
    expect(isRepeatZone(470, slowFiveK)).toBe(true);
  });
});

describe('formatRepTargetRange', () => {
  it('shows a range for a real zone range', () => {
    // 800m at 6:07-6:27/mi. 192.5s is 3:12.5, which rounds up to 3:13.
    expect(formatRepTargetRange(182.6, 192.5)).toBe('3:03-3:13');
  });
  it('collapses when both ends round to the same second', () => {
    // A "2:35-2:35" target is noise, not information.
    expect(formatRepTargetRange(154.9, 155.2)).toBe('2:35');
  });
  it('collapses an exact single pace', () => {
    expect(formatRepTargetRange(155, 155)).toBe('2:35');
  });
});

describe('explainRepTarget', () => {
  const zone: PaceZoneDefinition = {
    id: 'mcm-vo2', abbreviation: 'VO2', name: 'VO2 Max', notes: null,
    ruleType: 'RANGE', rangeDistanceAMeters: 3000, rangeDistanceBMeters: 5000,
    refDistanceMeters: null, offsetFastSec: null, offsetSlowSec: null,
  };
  const source = { distanceMiles: 5000 / 1609.34, timeSeconds: 18 * 60 };

  it('returns the same rep times repTimeSec would', () => {
    const paces = resolvePaceZone(zone, source)!;
    const target = explainRepTarget(paces, 800);
    expect(target.fastSec).toBeCloseTo(repTimeSec(paces.fastSecPerMile, 800), 6);
    expect(target.slowSec).toBeCloseTo(repTimeSec(paces.slowSecPerMile, 800), 6);
  });

  it('appends exactly one step to the zone\'s own derivation', () => {
    const paces = resolvePaceZone(zone, source)!;
    const target = explainRepTarget(paces, 800);
    expect(target.explain.steps.length).toBe(paces.explain.steps.length + 1);
  });

  it('the appended step lands on the rep time actually returned', () => {
    // The guarantee that makes nerd mode trustworthy on the interval sheet.
    const paces = resolvePaceZone(zone, source)!;
    const target = explainRepTarget(paces, 800);
    const last = target.explain.steps[target.explain.steps.length - 1];
    expect(last.value).toBeCloseTo(target.fastSec, 6);
    expect(last.substituted).toContain('800');
  });

  it('carries the rep distance actually used, not a default', () => {
    const paces = resolvePaceZone(zone, source)!;
    for (const dist of [400, 1000, 1600]) {
      const last = explainRepTarget(paces, dist).explain.steps.slice(-1)[0];
      expect(last.substituted).toContain(String(dist));
      expect(last.label).toContain(`${dist}m`);
    }
  });
});
