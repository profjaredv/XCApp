import { describe, it, expect } from 'vitest';
import { timerTarget } from './timerTarget';

describe('Timer button target (§3.5)', () => {
  it('opens the live timer for the one race today without results', () => {
    expect(timerTarget([{ id: 'r1', name: 'V', hasResults: true }, { id: 'r2', name: 'JV', hasResults: false }], [{ id: 's', title: 'x' }]))
      .toEqual({ kind: 'race', raceId: 'r2' });
  });
  it('asks which race when more than one is still open', () => {
    const t = timerTarget([{ id: 'r1', name: 'V', hasResults: false }, { id: 'r2', name: 'JV', hasResults: false }], []);
    expect(t.kind).toBe('pick-race');
  });
  it('falls to the scoped group\'s interval session when every race has results', () => {
    expect(timerTarget([{ id: 'r1', name: 'V', hasResults: true }], [{ id: 's1', title: '6x800' }])).toEqual({ kind: 'session', sessionId: 's1' });
  });
  it('opens the interval sessions list when there is nothing for today', () => {
    expect(timerTarget([], [])).toEqual({ kind: 'sessions-list' });
  });
});
