import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A global floor for type size and touch targets on phones, rather than
// 316 hand edits across 80 files that would drift the moment someone
// writes text-xs again.

const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
const floor = css.slice(css.lastIndexOf('@media (pointer: coarse)'));

describe('mobile type and target floor', () => {
  it('lifts the bottom of the type scale', () => {
    expect(floor).toContain('.text-xs {');
    expect(floor).toContain('font-size: 0.8125rem');
  });

  it('does NOT collapse text-xs into text-sm', () => {
    // 14px would flatten the hierarchy on every screen rather than fixing
    // the bottom of it: xs and sm would render identically.
    expect(floor).not.toContain('.text-xs {\n    font-size: 0.875rem');
  });

  it('rescues the hand-picked sizes below the scale', () => {
    expect(floor).toContain('.text-\\[10px\\]');
    expect(floor).toContain('.text-\\[11px\\]');
  });

  it('gives every shared Button a 44px minimum box', () => {
    expect(floor).toContain("[data-slot='button']");
    expect(floor).toContain('min-height: 2.75rem');
    expect(floor).toContain('min-width: 2.75rem');
  });

  it('uses min-* so a button that is already comfortable is left alone', () => {
    const button = floor.slice(floor.indexOf("[data-slot='button']"));
    expect(button).not.toMatch(/\n\s+height:/);
    expect(button).not.toMatch(/\n\s+width:/);
  });

  it('leaves hand-rolled buttons alone — their sizes were measured against a layout', () => {
    // Timer tiles, filter chips and segmented pills set their own
    // dimensions against a known grid; growing those blindly would break
    // layouts built for a 390px screen.
    expect(floor).not.toContain('button {');
    expect(floor).toContain("[data-slot='button']");
  });

  it('stays outside @layer, or Tailwind utilities would outrank it', () => {
    const at = css.lastIndexOf('@media (pointer: coarse)');
    let depth = 0;
    for (const ch of css.slice(0, at)) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    expect(depth).toBe(0);
  });

  it('is scoped to touch, so a desk keeps the density it was designed with', () => {
    expect(floor.startsWith('@media (pointer: coarse)')).toBe(true);
  });
});

describe('rows that hold several icon buttons can wrap', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  it('the group board header wraps rather than crushing the group name', () => {
    // Four actions at a 44px floor need 176px; on a 390px screen that
    // leaves nothing for the name beside them.
    const groups = read('pages/GroupsPage.tsx');
    expect(groups).toContain('<div className="flex flex-wrap items-center justify-end gap-1">');
    expect(groups).toContain('className="flex min-w-0 items-center gap-1.5 hover:text-foreground/80"');
    expect(groups).toContain('<span className="truncate">{col.name}</span>');
  });

  it('the interval session row wraps too', () => {
    expect(read('pages/IntervalSessionsPage.tsx')).toContain(
      '<div className="flex flex-wrap items-center justify-end gap-1">'
    );
  });
});
