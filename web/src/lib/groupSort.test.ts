import { describe, it, expect } from 'vitest';
import { sortAthletes, GROUP_SORT_LABELS, type GroupSortMode } from './groupSort';

const a = (name: string, avgPaceSecPerMile: number | null) => ({ name, avgPaceSecPerMile });

describe('sortAthletes', () => {
  it('puts the fastest average pace first', () => {
    const out = sortAthletes([a('Slow', 480), a('Fast', 360), a('Mid', 420)], 'paceAsc');
    expect(out.map((r) => r.name)).toEqual(['Fast', 'Mid', 'Slow']);
  });

  it('reverses for slowest first', () => {
    const out = sortAthletes([a('Slow', 480), a('Fast', 360), a('Mid', 420)], 'paceDesc');
    expect(out.map((r) => r.name)).toEqual(['Slow', 'Mid', 'Fast']);
  });

  it('sends athletes who have not raced to the BOTTOM in both directions', () => {
    // The whole point: an unraced athlete has no pace, not a pace of 0.
    // Treating null as 0 would put every freshman above the varsity pack
    // on a fastest-first board.
    const roster = [a('Unraced', null), a('Fast', 360), a('Slow', 480)];
    expect(sortAthletes(roster, 'paceAsc').map((r) => r.name)).toEqual(['Fast', 'Slow', 'Unraced']);
    expect(sortAthletes(roster, 'paceDesc').map((r) => r.name)).toEqual(['Slow', 'Fast', 'Unraced']);
  });

  it('orders several unraced athletes by name rather than arbitrarily', () => {
    const out = sortAthletes([a('Zoe', null), a('Adam', null), a('Fast', 360)], 'paceAsc');
    expect(out.map((r) => r.name)).toEqual(['Fast', 'Adam', 'Zoe']);
  });

  it('breaks pace ties by name so the board does not reshuffle between renders', () => {
    const out = sortAthletes([a('Blake', 400), a('Avery', 400)], 'paceAsc');
    expect(out.map((r) => r.name)).toEqual(['Avery', 'Blake']);
  });

  it('sorts by name case-insensitively', () => {
    const out = sortAthletes([a('bravo', null), a('Alpha', null)], 'name');
    expect(out.map((r) => r.name)).toEqual(['Alpha', 'bravo']);
  });

  it('does not mutate the array it was given', () => {
    const roster = [a('Slow', 480), a('Fast', 360)];
    sortAthletes(roster, 'paceAsc');
    expect(roster.map((r) => r.name)).toEqual(['Slow', 'Fast']);
  });

  it('labels every mode, so the control can be built from the type', () => {
    const modes: GroupSortMode[] = ['name', 'paceAsc', 'paceDesc'];
    for (const m of modes) expect(GROUP_SORT_LABELS[m]).toBeTruthy();
  });
});
