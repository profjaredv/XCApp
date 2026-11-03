// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import html from './fixtures/grid-boys.html?raw';
import text from './fixtures/grid-boys.txt?raw';
import { applyPicks, pickKey, readBox } from './gridPasteInput';

const below = text.slice(text.indexOf('Race Distances:'));
const tableOnly = text.slice(0, text.indexOf('Race Distances:'));

describe('readBox', () => {
  it('reads a plain-text paste with no html at all', () => {
    const r = readBox('Men', { text, html: '' });
    expect(r.state).toBe('ok');
    expect(r.payload?.athletes).toHaveLength(71);
    expect(r.payload?.athletes.some((a) => a.athleticAthleteId)).toBe(false);
    expect(r.summary).toMatch(/Boys: 71 athletes, 417 results across 7 meets/);
  });

  it('adds ids when the clipboard also carried the grid html', () => {
    const r = readBox('Men', { text, html });
    expect(r.state).toBe('ok');
    expect(r.payload?.athletes.every((a) => a.athleticAthleteId)).toBe(true);
  });

  it('is empty for a blank box, errors for a bad paste, and asks for the meet list when it is missing', () => {
    expect(readBox('Men', { text: '  ', html: '' }).state).toBe('empty');
    expect(readBox('Men', { text: 'nope', html: '' }).state).toBe('error');
    expect(readBox('Men', { text: tableOnly, html: '' }).state).toBe('needsInfo');
    expect(readBox('Men', { text: tableOnly, html: '' }, below).state).toBe('ok');
  });

  it('reads a whole-element html paste, and puts it in the right box', () => {
    expect(readBox('Men', { text: html, html: '' }).payload?.source).toBe('html');
    const wrong = readBox('Women', { text: html, html: '' });
    expect(wrong.state).toBe('error');
    expect(wrong.errors[0]).toBe('That is the Boys grid. Paste it in the Boys box.');
  });

  it('applies the coach\'s pick between two times in one cell', () => {
    const payload = readBox('Men', { text, html: '' }).payload!;
    const a = payload.athletes.find((x) => x.name === 'Kai Yates')!;
    expect(a.cells[0].time).toBe('6:07.0');
    const picked = applyPicks(payload, { [pickKey(a.key, 0, '1 Miles')]: '6:39.0' });
    expect(picked.athletes.find((x) => x.name === 'Kai Yates')!.cells[0].time).toBe('6:39.0');
    expect(payload.athletes.find((x) => x.name === 'Kai Yates')!.cells[0].time).toBe('6:07.0'); // not mutated
  });
});
