import { describe, it, expect } from 'vitest';
import { matchesQuery } from '@/lib/athleteSearch';

// Name matching for the group pickers. The failure this replaces was not
// a bug so much as an absence: a plain <Select> listing the whole roster,
// so finding one runner among ninety meant scrolling.

describe('matchesQuery', () => {
  it('matches on any word, not just the start of the name', () => {
    // Coaches think in last names. A prefix-only match on "Morgan Mays"
    // would find nothing for "mays", which is the common search.
    expect(matchesQuery('Morgan Mays', 'mays')).toBe(true);
    expect(matchesQuery('Morgan Mays', 'morgan')).toBe(true);
    expect(matchesQuery('Callum Woods-Vallejo', 'vallejo')).toBe(true);
  });

  it('ignores term order', () => {
    // What someone typing quickly actually produces.
    expect(matchesQuery('Morgan Mays', 'mor may')).toBe(true);
    expect(matchesQuery('Morgan Mays', 'may mor')).toBe(true);
  });

  it('requires every term to appear', () => {
    expect(matchesQuery('Morgan Mays', 'morgan lee')).toBe(false);
  });

  it('is case and whitespace insensitive', () => {
    expect(matchesQuery('Morgan Mays', '  MAYS  ')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    // An empty search box must not empty the list.
    expect(matchesQuery('Morgan Mays', '')).toBe(true);
    expect(matchesQuery('Morgan Mays', '   ')).toBe(true);
  });

  it('does not match a name it should not', () => {
    expect(matchesQuery('Jordan Lee', 'mays')).toBe(false);
  });
});
