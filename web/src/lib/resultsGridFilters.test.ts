import { describe, it, expect } from 'vitest';
import { toggleFilter, matchesGrade, matchesGender } from './resultsGridFilters';

// F2: an empty selection is "All". A chip is filled only when picked.

describe('toggleFilter', () => {
  const grades = [12, 11, 10, 9];
  it('picking a class from All selects just that class', () => {
    expect([...toggleFilter(new Set<number>(), 10, grades)]).toEqual([10]);
  });
  it('un-picking the last class returns to All', () => {
    expect(toggleFilter(new Set([10]), 10, grades).size).toBe(0);
  });
  it('picking every class collapses back to All', () => {
    expect(toggleFilter(new Set([12, 11, 10]), 9, grades).size).toBe(0);
  });
});

describe('matchesGrade', () => {
  it('All lets every athlete with a class year through, as before', () => {
    expect(matchesGrade(9, new Set())).toBe(true);
    expect(matchesGrade(null, new Set())).toBe(false);
  });
  it('a selection filters to it', () => {
    expect(matchesGrade(9, new Set([10]))).toBe(false);
    expect(matchesGrade(10, new Set([10]))).toBe(true);
  });
});

describe('matchesGender', () => {
  it('All includes athletes with no gender on record, as before', () => {
    expect(matchesGender(null, new Set())).toBe(true);
    expect(matchesGender('F', new Set())).toBe(true);
  });
  it('a selection excludes unknowns and the other gender', () => {
    expect(matchesGender('F', new Set(['M']))).toBe(false);
    expect(matchesGender(null, new Set(['M']))).toBe(false);
    expect(matchesGender('M', new Set(['M']))).toBe(true);
  });
});
