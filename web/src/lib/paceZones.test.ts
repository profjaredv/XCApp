import { describe, it, expect } from 'vitest';
import {
  riegelEquivalentTimeSec,
  equivalentRacePaceSecPerMile,
  resolvePaceZone,
  resolvePaceZones,
  MCMILLAN_ZONES,
  type PaceZoneDefinition,
} from './paceZones';

// A 5K in 18:00 is the worked example throughout: a real, mid-pack varsity
// high-school boy's time, so every expected number below is one a coach can
// sanity-check by eye. 18:00 for 5000m is 5:47.6/mile.
const FIVE_K = { distanceMiles: 5000 / 1609.34, timeSeconds: 18 * 60 };

const MILE_PER_METER = 1 / 1609.34;

describe('Riegel equivalent times', () => {
  it('returns the same time for the same distance', () => {
    expect(riegelEquivalentTimeSec(5000, 1080, 5000)).toBeCloseTo(1080, 6);
  });

  it('predicts a slower pace at a longer distance', () => {
    const tenK = riegelEquivalentTimeSec(5000, 1080, 10000);
    // Doubling the distance costs more than doubling the time would
    // suggest is possible — 2^1.06 = 2.085.
    expect(tenK).toBeCloseTo(1080 * Math.pow(2, 1.06), 6);
    expect(tenK).toBeGreaterThan(2160);
  });

  it('predicts a faster pace at a shorter distance', () => {
    const mile = riegelEquivalentTimeSec(5000, 1080, 1609.34);
    expect(mile).toBeLessThan(1080 / (5000 / 1609.34) * 1.0);
    // ~5:20 for an 18:00 5K runner — the number a coach would nod at.
    expect(mile).toBeGreaterThan(300);
    expect(mile).toBeLessThan(340);
  });

  it('is self-consistent: there and back returns the original', () => {
    const mile = riegelEquivalentTimeSec(5000, 1080, 1609.34);
    expect(riegelEquivalentTimeSec(1609.34, mile, 5000)).toBeCloseTo(1080, 6);
  });

  it('refuses nonsense inputs instead of returning NaN', () => {
    expect(riegelEquivalentTimeSec(0, 1080, 5000)).toBeNull();
    expect(riegelEquivalentTimeSec(5000, 0, 5000)).toBeNull();
    expect(riegelEquivalentTimeSec(5000, 1080, 0)).toBeNull();
    expect(riegelEquivalentTimeSec(-5000, 1080, 5000)).toBeNull();
  });
});

describe('equivalent race pace', () => {
  it('returns the source race\'s own pace when asked for its own distance', () => {
    const pace = equivalentRacePaceSecPerMile(FIVE_K, 5000);
    // 1080s over 3.10686 miles = 347.6 s/mi = 5:47.6
    expect(pace).toBeCloseTo(1080 / (5000 * MILE_PER_METER), 4);
    expect(pace).toBeCloseTo(347.63, 1);
  });

  it('gives a faster pace for a shorter race', () => {
    const milePace = equivalentRacePaceSecPerMile(FIVE_K, 1609.34)!;
    const fiveKPace = equivalentRacePaceSecPerMile(FIVE_K, 5000)!;
    expect(milePace).toBeLessThan(fiveKPace);
  });

  it('gives a slower pace for a longer race', () => {
    const tenKPace = equivalentRacePaceSecPerMile(FIVE_K, 10000)!;
    const fiveKPace = equivalentRacePaceSecPerMile(FIVE_K, 5000)!;
    expect(tenKPace).toBeGreaterThan(fiveKPace);
  });

  it('is null for an unusable source race', () => {
    expect(equivalentRacePaceSecPerMile({ distanceMiles: 0, timeSeconds: 1080 }, 5000)).toBeNull();
    expect(equivalentRacePaceSecPerMile({ distanceMiles: 3.1, timeSeconds: 0 }, 5000)).toBeNull();
  });
});

// --- the coach's own definitions ---

const DIS: PaceZoneDefinition = {
  id: 'dis', abbreviation: 'DIS', name: 'Distance', notes: null,
  ruleType: 'OFFSET', refDistanceMeters: 1609, offsetFastSec: 120, offsetSlowSec: 180,
  rangeDistanceAMeters: null, rangeDistanceBMeters: null,
};

const VO2: PaceZoneDefinition = {
  id: 'vo2', abbreviation: 'VO2', name: 'VO2 Max', notes: null,
  ruleType: 'RANGE', rangeDistanceAMeters: 3218, rangeDistanceBMeters: 5000,
  refDistanceMeters: null, offsetFastSec: null, offsetSlowSec: null,
};

describe('OFFSET zones', () => {
  it('"2-3 minutes slower than best 1 mile time" adds exactly 120 and 180 sec/mile', () => {
    const milePace = equivalentRacePaceSecPerMile(FIVE_K, 1609)!;
    const zone = resolvePaceZone(DIS, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeCloseTo(milePace + 120, 6);
    expect(zone.slowSecPerMile).toBeCloseTo(milePace + 180, 6);
  });

  it('the fast end is always the quicker (smaller) pace', () => {
    const zone = resolvePaceZone(DIS, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeLessThan(zone.slowSecPerMile);
  });

  it('a negative offset produces a pace faster than the reference', () => {
    const faster = resolvePaceZone(
      { ...DIS, refDistanceMeters: 5000, offsetFastSec: -45, offsetSlowSec: -15 },
      FIVE_K
    )!;
    const fiveKPace = equivalentRacePaceSecPerMile(FIVE_K, 5000)!;
    expect(faster.fastSecPerMile).toBeCloseTo(fiveKPace - 45, 6);
    expect(faster.slowSecPerMile).toBeCloseTo(fiveKPace - 15, 6);
    expect(faster.fastSecPerMile).toBeLessThan(fiveKPace);
  });

  it('equal offsets produce a single pace, not a range', () => {
    const zone = resolvePaceZone({ ...DIS, offsetFastSec: 90, offsetSlowSec: 90 }, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeCloseTo(zone.slowSecPerMile, 6);
    expect(zone.isSinglePace).toBe(true);
  });
});

describe('RANGE zones', () => {
  it('"2mi to 5k race pace" spans the two equivalent paces', () => {
    const twoMile = equivalentRacePaceSecPerMile(FIVE_K, 3218)!;
    const fiveK = equivalentRacePaceSecPerMile(FIVE_K, 5000)!;
    const zone = resolvePaceZone(VO2, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeCloseTo(twoMile, 6);
    expect(zone.slowSecPerMile).toBeCloseTo(fiveK, 6);
  });

  it('the distances can be given in either order', () => {
    const forward = resolvePaceZone(VO2, FIVE_K)!;
    const backward = resolvePaceZone(
      { ...VO2, rangeDistanceAMeters: 5000, rangeDistanceBMeters: 3218 },
      FIVE_K
    )!;
    expect(backward.fastSecPerMile).toBeCloseTo(forward.fastSecPerMile, 6);
    expect(backward.slowSecPerMile).toBeCloseTo(forward.slowSecPerMile, 6);
  });

  it('the fast end is the shorter race, which is the quicker pace', () => {
    const zone = resolvePaceZone(VO2, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeLessThan(zone.slowSecPerMile);
  });
});

describe('zones a coach would recognise', () => {
  // The whole point of the feature: an 18:00 5K runner's paces should land
  // where a coach expects, or the engine is wrong however clean it is.
  it('EHS Distance pace for an 18:00 5K runner is 7:25-8:25/mile', () => {
    // An 18:00 5K runner's equivalent mile is 5:25, so "2-3 minutes
    // slower than best mile" is 7:25-8:25. Written as an exact expectation
    // rather than a loose band because this is the number a coach will
    // check against their own whiteboard first.
    const zone = resolvePaceZone(DIS, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeCloseTo(7 * 60 + 25, 0);
    expect(zone.slowSecPerMile).toBeCloseTo(8 * 60 + 25, 0);
  });

  it("EHS Threshold's two formulations do NOT agree, and that is real", () => {
    // The coach wrote T as "1:00-1:30 slower than best mile time OR :30
    // slower than 5k average pace". For an 18:00 5K runner those are
    // 6:25-6:55 and 6:18 — the mile-anchored version is up to 37 sec/mile
    // slower. Only one can be the computed rule; the other is kept as the
    // zone's notes. Asserted here so that if the engine ever quietly makes
    // them agree, someone has to come and look at why.
    const mileAnchored = resolvePaceZone(
      { ...DIS, abbreviation: 'T', offsetFastSec: 60, offsetSlowSec: 90 },
      FIVE_K
    )!;
    const fiveKAnchored = resolvePaceZone(
      { ...DIS, abbreviation: 'T', refDistanceMeters: 5000, offsetFastSec: 30, offsetSlowSec: 30 },
      FIVE_K
    )!;
    expect(mileAnchored.fastSecPerMile).toBeCloseTo(6 * 60 + 25, 0);
    expect(fiveKAnchored.fastSecPerMile).toBeCloseTo(6 * 60 + 18, 0);
    expect(mileAnchored.fastSecPerMile).toBeGreaterThan(fiveKAnchored.fastSecPerMile);
  });

  it('EHS VO2 pace for an 18:00 5K runner is roughly 5:30-5:50/mile', () => {
    const zone = resolvePaceZone(VO2, FIVE_K)!;
    expect(zone.fastSecPerMile).toBeGreaterThan(5 * 60 + 15);
    expect(zone.slowSecPerMile).toBeLessThan(6 * 60);
  });

  it('every zone gets slower as the athlete gets slower', () => {
    const slower = { distanceMiles: 5000 / 1609.34, timeSeconds: 21 * 60 };
    for (const def of [DIS, VO2]) {
      const fast = resolvePaceZone(def, FIVE_K)!;
      const slow = resolvePaceZone(def, slower)!;
      expect(slow.fastSecPerMile).toBeGreaterThan(fast.fastSecPerMile);
    }
  });
});

describe('bad definitions degrade to null, never to a wrong number', () => {
  it('an OFFSET missing its reference distance resolves to null', () => {
    expect(resolvePaceZone({ ...DIS, refDistanceMeters: null }, FIVE_K)).toBeNull();
  });

  it('an OFFSET missing an offset resolves to null', () => {
    expect(resolvePaceZone({ ...DIS, offsetFastSec: null }, FIVE_K)).toBeNull();
  });

  it('a RANGE missing a distance resolves to null', () => {
    expect(resolvePaceZone({ ...VO2, rangeDistanceBMeters: null }, FIVE_K)).toBeNull();
  });

  it('an unusable source race resolves every zone to null', () => {
    const dead = { distanceMiles: 0, timeSeconds: 0 };
    expect(resolvePaceZone(DIS, dead)).toBeNull();
    expect(resolvePaceZone(VO2, dead)).toBeNull();
  });

  it('a zone that cannot resolve is still returned, so the coach sees it is broken', () => {
    const resolved = resolvePaceZones([DIS, { ...VO2, rangeDistanceBMeters: null }], FIVE_K);
    expect(resolved).toHaveLength(2);
    expect(resolved[1].paces).toBeNull();
    expect(resolved[1].definition.abbreviation).toBe('VO2');
  });
});

describe('the McMillan-style default set', () => {
  it('is expressed in the same rule vocabulary a coach can type', () => {
    for (const zone of MCMILLAN_ZONES) {
      expect(['OFFSET', 'RANGE']).toContain(zone.ruleType);
      expect(zone.abbreviation.length).toBeGreaterThan(0);
      expect(zone.name.length).toBeGreaterThan(0);
    }
  });

  it('every default zone resolves for a real race', () => {
    for (const zone of MCMILLAN_ZONES) {
      expect(resolvePaceZone(zone, FIVE_K), `${zone.name} should resolve`).not.toBeNull();
    }
  });

  it('runs strictly fastest to slowest, hardest zone first', () => {
    const paces = MCMILLAN_ZONES.map((z) => resolvePaceZone(z, FIVE_K)!.fastSecPerMile);
    for (let i = 1; i < paces.length; i += 1) {
      expect(paces[i], `${MCMILLAN_ZONES[i].name} should be slower than ${MCMILLAN_ZONES[i - 1].name}`)
        .toBeGreaterThan(paces[i - 1]);
    }
  });

  it('recovery is slower than 5K race pace and speed work is faster', () => {
    const fiveK = equivalentRacePaceSecPerMile(FIVE_K, 5000)!;
    const byAbbr = Object.fromEntries(MCMILLAN_ZONES.map((z) => [z.abbreviation, resolvePaceZone(z, FIVE_K)!]));
    expect(byAbbr.REC.fastSecPerMile).toBeGreaterThan(fiveK);
    expect(byAbbr.SP.fastSecPerMile).toBeLessThan(fiveK);
  });

  it('has unique abbreviations', () => {
    const abbrs = MCMILLAN_ZONES.map((z) => z.abbreviation);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });
});

// The nerd-mode trace is only worth showing if it cannot disagree with the
// number beside it. These are the tests that make that true: they assert
// the trace's own arithmetic lands on the value actually returned, so a
// change to the calculation that forgets the trace fails the build instead
// of shipping a panel that lies.
describe('the explanation is honest about what was computed', () => {
  const zones: Array<[string, PaceZoneDefinition]> = [
    ['EHS Distance (OFFSET)', DIS],
    ['EHS VO2 (RANGE)', VO2],
    ...MCMILLAN_ZONES.map((z) => [`default ${z.abbreviation}`, z] as [string, PaceZoneDefinition]),
  ];

  it.each(zones)('%s: the last step\'s value is the pace returned', (_name, definition) => {
    const resolved = resolvePaceZone(definition, FIVE_K)!;
    const last = resolved.explain.steps[resolved.explain.steps.length - 1];
    expect(last.value).toBeCloseTo(resolved.fastSecPerMile, 6);
  });

  it.each(zones)('%s: every step states a real, finite number', (_name, definition) => {
    const resolved = resolvePaceZone(definition, FIVE_K)!;
    expect(resolved.explain.steps.length).toBeGreaterThan(0);
    for (const step of resolved.explain.steps) {
      expect(Number.isFinite(step.value)).toBe(true);
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.substituted.length).toBeGreaterThan(0);
      expect(step.result.length).toBeGreaterThan(0);
    }
  });

  it('names the source race it worked from, so the input is checkable too', () => {
    const resolved = resolvePaceZone(DIS, FIVE_K)!;
    expect(resolved.explain.title).toContain('5000m');
    expect(resolved.explain.title).toContain('18:00');
  });

  it('points at the file that does the work', () => {
    expect(resolvePaceZone(DIS, FIVE_K)!.explain.source).toContain('paceZones.ts');
  });

  it('shows the substituted numbers, not just the symbols', () => {
    // "T₂ = T₁ × (D₂ ÷ D₁)^1.06" alone proves nothing about THIS athlete.
    // The substitution carrying their actual race is the whole point.
    const riegel = resolvePaceZone(DIS, FIVE_K)!.explain.steps[0];
    expect(riegel.substituted).toContain('18:00');
    expect(riegel.substituted).toContain('1609');
    expect(riegel.formula).toContain('1.06');
  });

  it('does not dress up plain division as a prediction', () => {
    // A zone anchored on the distance actually raced needs no equivalency
    // step, and showing one would overstate how derived the number is.
    const anchoredOn5k: PaceZoneDefinition = { ...DIS, refDistanceMeters: 5000 };
    const steps = resolvePaceZone(anchoredOn5k, FIVE_K)!.explain.steps;
    expect(steps.some((s) => s.formula?.includes('Riegel'))).toBe(false);
  });

  it('keeps the formula on a RANGE zone, not just the numbers', () => {
    // The substituted arithmetic shows WHAT happened; the formula shows
    // why. Joining two sub-steps used to drop the latter.
    //
    // Only the PREDICTED end carries Riegel. VO2's slow end is 5000m —
    // the distance this athlete actually raced — so that end is plain
    // division, and claiming Riegel there would overstate the derivation.
    const steps = resolvePaceZone(VO2, FIVE_K)!.explain.steps;
    expect(steps[0].formula).toContain('1.06');
    expect(steps[1].formula).toBeTruthy();
    expect(steps[1].formula).not.toContain('1.06');

    // A zone where BOTH ends are predicted carries it on both.
    const bothPredicted = { ...VO2, rangeDistanceAMeters: 800, rangeDistanceBMeters: 1609 };
    const bothSteps = resolvePaceZone(bothPredicted, FIVE_K)!.explain.steps;
    expect(bothSteps[0].formula).toContain('1.06');
    expect(bothSteps[1].formula).toContain('1.06');
  });

  it('carries enough precision that the arithmetic reproduces by hand', () => {
    // A trace rounded to the second does not check out — 2:35 ÷ 0.497mi is
    // 5:12 next to a displayed 5:11 — and a coach who spots that trusts the
    // number less than before they looked.
    const speed = MCMILLAN_ZONES.find((z) => z.abbreviation === 'SP')!;
    const steps = resolvePaceZone(speed, FIVE_K)!.explain.steps;
    expect(steps[0].substituted).toMatch(/\d:\d\d\.\d/);
  });

  it('shows both ends of a RANGE zone separately', () => {
    // The width of a range zone comes from the gap between two predicted
    // race paces; collapsing that to one line would hide it.
    const steps = resolvePaceZone(VO2, FIVE_K)!.explain.steps;
    expect(steps.length).toBe(3);
    expect(steps[0].label).toContain('3218m');
    expect(steps[1].label).toContain('5000m');
  });

  it('tracks the calculation when the athlete changes', () => {
    const slower = { distanceMiles: 5000 / 1609.34, timeSeconds: 21 * 60 };
    const a = resolvePaceZone(DIS, FIVE_K)!;
    const b = resolvePaceZone(DIS, slower)!;
    expect(a.explain.steps[0].substituted).not.toBe(b.explain.steps[0].substituted);
    expect(b.explain.steps[b.explain.steps.length - 1].value).toBeCloseTo(b.fastSecPerMile, 6);
  });
});
