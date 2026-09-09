import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// iOS Safari zooms the page in when a focused text control is under 16px
// and never zooms back out, which is what "the screen jumps and then I
// can't scroll or pinch" is on an iPhone. Two defences, both tested here:
// the global guard, and the individual controls not relying on it.

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('index.css');

describe('iOS form-control zoom guard', () => {
  it('forces text controls to 16px on touch screens', () => {
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]*font-size: 16px/);
  });

  it('stays OUTSIDE @layer, or Tailwind utilities would outrank it', () => {
    // Unlayered rules beat every cascade layer. Tailwind puts text-sm in
    // @layer utilities, so a guard inside @layer base silently loses to
    // any component that sets its own size — the exact failure this
    // guard exists to prevent.
    const guardAt = css.indexOf('@media (pointer: coarse)');
    expect(guardAt).toBeGreaterThan(-1);
    let depth = 0;
    for (const ch of css.slice(0, guardAt)) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    expect(depth).toBe(0);
  });

  it('leaves checkboxes and radios alone — 16px there changes their box, not text', () => {
    const guard = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(guard).toContain(":not([type='checkbox'])");
    expect(guard).toContain(":not([type='radio'])");
  });
});

describe('text controls do not depend on the guard alone', () => {
  const mobileSafe = (cls: string) => /text-base/.test(cls) && !/(^|\s)text-(sm|xs)(\s|$)/.test(cls);

  it('the splits grid cell defaults to 16px on mobile', () => {
    const src = read('components/splits/SplitCell.tsx');
    const m = src.match(/className = '([^']+)'/);
    expect(m).not.toBeNull();
    expect(mobileSafe(m![1])).toBe(true);
    expect(m![1]).toContain('md:text-sm');
  });

  it("the pace calculator's hand-rolled input does too", () => {
    const src = read('components/tools/PaceCalculator.tsx');
    const m = src.match(/className="flex h-10 w-full rounded-md bg-transparent[^"]*"/);
    expect(m).not.toBeNull();
    expect(mobileSafe(m![0])).toBe(true);
  });

  it('the shared Input and Textarea keep the text-base/md:text-sm pairing they ship with', () => {
    for (const f of ['components/ui/input.tsx', 'components/ui/textarea.tsx']) {
      const src = read(f);
      expect(src).toContain('text-base');
      expect(src).toContain('md:text-sm');
    }
  });
});

describe('dialogs and the iOS keyboard', () => {
  // Comments stripped: this file's own prose explains why arbitrary
  // min-[Npx]: variants are avoided, and that must not read as usage.
  const dialog = read('components/ui/dialog.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

  it('anchors to the top on phones instead of vertically centering', () => {
    // iOS does not shrink the layout viewport for the keyboard, so a
    // fixed dialog centered with translate-y-[-50%] keeps its position
    // while the keyboard covers the bottom half — and the page behind is
    // scroll-locked, so the hidden half is unreachable.
    expect(dialog).toContain('top-4');
    expect(dialog).toContain('translate-y-0');
  });

  it('still centers from sm up, via a named breakpoint that compiles after the base rule', () => {
    expect(dialog).toContain('sm:top-[50%]');
    expect(dialog).toContain('sm:translate-y-[-50%]');
    expect(dialog).not.toContain('min-[');
  });
});
