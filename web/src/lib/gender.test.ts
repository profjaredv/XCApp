import { describe, it, expect } from 'vitest';
import { normalizeGender, genderLabel } from './gender';

describe('normalizeGender', () => {
  it('collapses every spelling the data actually contains onto one key', () => {
    // A real team had both 'M' and 'Men' stored, which produced three
    // gender filter chips (Boys, Girls, Men) on the Results Grid.
    for (const v of ['M', 'm', 'Male', 'male', 'Men', 'MEN', 'boy', 'Boys']) {
      expect(normalizeGender(v)).toBe('M');
    }
    for (const v of ['F', 'f', 'Female', 'Women', 'girl', 'Girls']) {
      expect(normalizeGender(v)).toBe('F');
    }
  });

  it('tolerates surrounding whitespace, which a CSV import leaves behind', () => {
    expect(normalizeGender('  Men  ')).toBe('M');
  });

  it('is null — never a guess — for anything it does not recognise', () => {
    for (const v of ['', null, undefined, 'X', 'unknown', 'nonbinary']) {
      expect(normalizeGender(v)).toBeNull();
    }
  });

  it('matches the backend list in backend/lib/gender.js', () => {
    // Same inputs, same buckets — a value the API normalizes to M must
    // not normalize to null here, or a filter would drop that athlete.
    expect(['m', 'male', 'men', 'boy', 'boys'].every((v) => normalizeGender(v) === 'M')).toBe(true);
    expect(['f', 'female', 'women', 'girl', 'girls'].every((v) => normalizeGender(v) === 'F')).toBe(true);
  });
});

describe('genderLabel', () => {
  it('uses one vocabulary regardless of how the value was stored', () => {
    expect(genderLabel('Men')).toBe('Male');
    expect(genderLabel('M')).toBe('Male');
    expect(genderLabel('Girls')).toBe('Female');
  });

  it('says Unspecified rather than echoing a raw value back at a coach', () => {
    expect(genderLabel('X')).toBe('Unspecified');
    expect(genderLabel(null)).toBe('Unspecified');
  });
});
