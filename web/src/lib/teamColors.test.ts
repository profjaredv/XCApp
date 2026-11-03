import { describe, expect, it } from 'vitest';
import { buildThemeCss, contrastRatio, exportPalette, hexToOklch, oklchToHex, readableOnDark, readableOnLight, resolveColors } from './teamColors';

describe('color conversion', () => {
  it('round-trips hex through oklch', () => {
    for (const hex of ['#b22222', '#1f6f43', '#ffd700', '#123456', '#ffffff', '#000000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });
});

describe('readability', () => {
  it('darkens a pale brand color until it reads on white', () => {
    const r = readableOnLight('#ffd700');
    expect(r.adjusted).toBe(true);
    expect(contrastRatio(hexToOklch(r.hex), { l: 1, c: 0, h: 0 })).toBeGreaterThanOrEqual(4.4);
  });
  it('leaves a dark brand color alone in light mode', () => {
    expect(readableOnLight('#8b0000')).toEqual({ hex: '#8b0000', adjusted: false });
  });
  it('lightens a dark brand color until it reads on the dark page', () => {
    const r = readableOnDark('#1a2a6c');
    expect(r.adjusted).toBe(true);
    expect(contrastRatio(hexToOklch(r.hex), { l: 0.16, c: 0.02, h: 0 })).toBeGreaterThanOrEqual(4.4);
  });
});

describe('theme css', () => {
  it('is empty when the team has no colors', () => {
    expect(buildThemeCss(null)).toBe('');
    expect(buildThemeCss({})).toBe('');
    expect(buildThemeCss({ primary: 'red' })).toBe('');
  });
  it('sets light and dark tokens from the primary, and the accent when given', () => {
    const css = buildThemeCss({ primary: '#b22222', accent: '#ffd700' });
    expect(css).toMatch(/^:root\{.*--primary:oklch\(.*\}\.dark\{.*--primary:oklch\(/);
    expect(css).toContain('--accent:');
    expect(css).toContain('--hero-end:');
  });
  it('leaves the default accent alone when none is picked', () => {
    expect(buildThemeCss({ primary: '#b22222' })).not.toContain('--accent:');
  });
  it('only ever emits oklch() values and custom properties', () => {
    const css = buildThemeCss({ primary: '#b22222', accent: '#ffd700', primaryDark: '#ff6666' });
    expect(css.replace(/[:;{}.,\s]/g, '')).toMatch(/^[-a-z0-9()/]+$/);
  });
});

describe('export palette', () => {
  it('is null without a primary', () => expect(exportPalette({})).toBeNull());
  it('uses the picked export background', () => {
    expect(exportPalette({ primary: '#b22222', exportBackground: '#111111' })?.background).toBe('#111111');
  });
  it('derives a dark background from the primary otherwise', () => {
    const p = exportPalette({ primary: '#b22222' });
    expect(p?.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexToOklch(p!.background).l).toBeLessThan(0.3);
  });
});

describe('resolveColors', () => {
  it('uses the dark-mode pick when provided', () => {
    const r = resolveColors({ primary: '#8b0000', primaryDark: '#ff7777' });
    expect(r?.dark.primary).toBe('#ff7777');
  });
});
