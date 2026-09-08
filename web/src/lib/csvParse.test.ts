import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, dedupeColumnLabels } from '@/lib/csvParse';

// dedupeColumnLabels exists because toCsv looks a column up by its header
// text — Results Grid's race names ("Varsity Boys") legitimately recur
// meet after meet all season, and without this, exporting two same-named
// races would collide: one race's times would silently overwrite the
// other's in the CSV.

describe('dedupeColumnLabels', () => {
  it('leaves labels alone when nothing repeats', () => {
    expect(dedupeColumnLabels(['Varsity Boys', 'Varsity Girls'])).toEqual(['Varsity Boys', 'Varsity Girls']);
  });

  it('numbers repeats in order, starting from the second occurrence', () => {
    expect(dedupeColumnLabels(['Varsity Boys', 'Varsity Boys', 'Varsity Boys'])).toEqual([
      'Varsity Boys',
      'Varsity Boys (2)',
      'Varsity Boys (3)',
    ]);
  });

  it('tracks each distinct label\'s own repeat count independently', () => {
    expect(dedupeColumnLabels(['Varsity Boys', 'JV Boys', 'Varsity Boys', 'JV Boys'])).toEqual([
      'Varsity Boys',
      'JV Boys',
      'Varsity Boys (2)',
      'JV Boys (2)',
    ]);
  });

  it('round-trips through toCsv without column collisions', () => {
    const columns = dedupeColumnLabels(['Varsity Boys', 'Varsity Boys']);
    const csv = toCsv(
      ['Athlete', ...columns],
      [{ Athlete: 'Runner', [columns[0]]: '18:00', [columns[1]]: '19:30' }]
    );
    const parsed = parseCsv(csv);
    expect(parsed.rows[0][columns[0]]).toBe('18:00');
    expect(parsed.rows[0][columns[1]]).toBe('19:30');
  });
});
