import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A grid with no explicit column sizes gets one `auto` track, and that track
// grows to the widest unbreakable content (a long attention label, a meet
// location) — pushing the cards off the right edge of a phone. Every
// two-column grid on the next Today page must pin its phone layout to one
// `minmax(0,1fr)` column.
const src = readFileSync(new URL('./TodayPageNext.tsx', import.meta.url), 'utf8');

describe('next Today page phone layout', () => {
  it('pins every responsive grid to a shrinkable single column', () => {
    const grids = src.match(/className="grid [^"]*lg:grid-cols-[^"]*"/g) ?? [];
    expect(grids.length).toBeGreaterThanOrEqual(3);
    for (const g of grids) expect(g).toContain('grid-cols-[minmax(0,1fr)]');
  });
});
