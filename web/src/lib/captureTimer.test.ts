import { describe, it, expect } from 'vitest';
import {
  orderCaptures,
  nextUnnamedId,
  unnamedCount,
  assignCapture,
  unassignCapture,
  removeCapture,
  remainingAthletes,
  remainingBy,
  namedCaptures,
  newCaptureId,
  type Capture,
} from './captureTimer';

const c = (id: string, timeSec: number, athleteId: string | null = null): Capture => ({ id, timeSec, athleteId });

describe('orderCaptures', () => {
  it('places by elapsed time, not by the order they were pressed', () => {
    const out = orderCaptures([c('b', 200), c('a', 100), c('d', 400)]);
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'd']);
    expect(out.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it('counts unnamed runners in the placing — they still took a place', () => {
    const out = orderCaptures([c('a', 100, 'x'), c('b', 110), c('d', 120, 'y')]);
    expect(out.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(out[2].athleteId).toBe('y');
  });

  it('breaks identical times by press order so rows never swap under a thumb', () => {
    const out = orderCaptures([c('first', 100), c('second', 100), c('third', 100)]);
    expect(out.map((r) => r.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the array it was handed', () => {
    const list = [c('b', 200), c('a', 100)];
    orderCaptures(list);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('nextUnnamedId', () => {
  it('is the earliest unnamed capture, regardless of press order', () => {
    expect(nextUnnamedId([c('late', 300), c('early', 100), c('named', 50, 'x')])).toBe('early');
  });

  it('is null once everyone has a name', () => {
    expect(nextUnnamedId([c('a', 100, 'x'), c('b', 200, 'y')])).toBeNull();
  });

  it('is null with no captures at all', () => {
    expect(nextUnnamedId([])).toBeNull();
  });
});

describe('assignCapture', () => {
  it('names a capture', () => {
    const out = assignCapture([c('a', 100)], 'a', 'ath1');
    expect(out[0].athleteId).toBe('ath1');
  });

  it('MOVES an athlete already on another capture rather than duplicating them', () => {
    // Two rows claiming one runner would write two results for them and
    // silently lose whoever the other row actually was.
    const out = assignCapture([c('a', 100, 'ath1'), c('b', 200)], 'b', 'ath1');
    expect(out.find((r) => r.id === 'a')!.athleteId).toBeNull();
    expect(out.find((r) => r.id === 'b')!.athleteId).toBe('ath1');
  });

  it('is a no-op-ish reassignment when the same athlete is re-tapped on their own row', () => {
    const out = assignCapture([c('a', 100, 'ath1')], 'a', 'ath1');
    expect(out[0].athleteId).toBe('ath1');
    expect(out).toHaveLength(1);
  });

  it('leaves other captures untouched', () => {
    const out = assignCapture([c('a', 100, 'x'), c('b', 200)], 'b', 'y');
    expect(out.find((r) => r.id === 'a')!.athleteId).toBe('x');
  });
});

describe('unassignCapture / removeCapture', () => {
  it('clears a name but keeps the time — the time is the irreplaceable part', () => {
    const out = unassignCapture([c('a', 100, 'x')], 'a');
    expect(out[0].athleteId).toBeNull();
    expect(out[0].timeSec).toBe(100);
  });

  it('removes a capture entirely for a genuine mis-press', () => {
    expect(removeCapture([c('a', 100), c('b', 200)], 'a').map((r) => r.id)).toEqual(['b']);
  });
});

describe('remainingAthletes', () => {
  const roster = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }];

  it('drops anyone already named to a capture', () => {
    const out = remainingAthletes(roster, [c('a', 100, 'y')]);
    expect(out.map((r) => r.id)).toEqual(['x', 'z']);
  });

  it('drops anyone who already has a time saved elsewhere', () => {
    const out = remainingAthletes(roster, [], new Set(['z']));
    expect(out.map((r) => r.id)).toEqual(['x', 'y']);
  });

  it('keeps the order it was handed, so a fastest-first grid stays fastest-first', () => {
    const out = remainingAthletes([roster[2], roster[0], roster[1]], []);
    expect(out.map((r) => r.id)).toEqual(['z', 'x', 'y']);
  });

  it('ignores unnamed captures — they claim nobody yet', () => {
    expect(remainingAthletes(roster, [c('a', 100), c('b', 200)])).toHaveLength(3);
  });
});

describe('namedCaptures', () => {
  it('returns only named rows, in finish order, shaped for the results endpoint', () => {
    const out = namedCaptures([c('b', 200, 'y'), c('a', 100, 'x'), c('u', 150)]);
    expect(out).toEqual([{ athleteId: 'x', time: 100 }, { athleteId: 'y', time: 200 }]);
  });

  it('is empty when nothing has been named yet', () => {
    expect(namedCaptures([c('a', 100), c('b', 200)])).toEqual([]);
  });
});

describe('unnamedCount / newCaptureId', () => {
  it('counts what is left to name', () => {
    expect(unnamedCount([c('a', 100, 'x'), c('b', 200), c('d', 300)])).toBe(2);
  });

  it('hands out distinct ids', () => {
    expect(new Set([newCaptureId(), newCaptureId(), newCaptureId()]).size).toBe(3);
  });
});

describe('remainingBy', () => {
  it('filters rows that key on something other than `id` without a cast', () => {
    const entrants = [{ athleteId: 'x', name: 'X' }, { athleteId: 'y', name: 'Y' }];
    const out = remainingBy(entrants, [c('a', 100, 'x')], new Set(), (e) => e.athleteId);
    expect(out.map((r) => r.athleteId)).toEqual(['y']);
  });

  it('honours the already-timed set as well as the captures', () => {
    const entrants = [{ athleteId: 'x' }, { athleteId: 'y' }, { athleteId: 'z' }];
    const out = remainingBy(entrants, [c('a', 100, 'x')], new Set(['y']), (e) => e.athleteId);
    expect(out.map((r) => r.athleteId)).toEqual(['z']);
  });
});
