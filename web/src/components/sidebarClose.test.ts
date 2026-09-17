import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Open, the mobile drawer is fixed at z-20 and covers the header —
// including the hamburger that opened it. With no backdrop and no close
// button, the only exit was picking a nav item: a coach who opened the
// menu to look at it had to navigate somewhere to get rid of it.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const layout = code(read('components/Layout.tsx'));

describe('closing the mobile sidebar', () => {
  it('tapping outside closes it', () => {
    expect(layout).toContain('fixed inset-0 z-10 bg-black/50 md:hidden');
    expect(layout).toContain('onClick={() => setIsMobileOpen(false)}');
  });

  it('puts the backdrop UNDER the drawer, or it would swallow every tap', () => {
    // Drawer is z-20; a backdrop at the same level or above would cover
    // the nav items and close the menu instead of navigating.
    const backdrop = layout.slice(layout.indexOf('bg-black/50'));
    expect(layout).toContain('z-10 bg-black/50');
    expect(backdrop.slice(0, 200)).not.toContain('z-20');
  });

  it('offers an explicit close button for a thumb already on the drawer', () => {
    expect(layout).toContain('aria-label="Close menu"');
    expect(layout).toContain('absolute right-3 top-3');
  });

  it('closes on Escape', () => {
    expect(layout).toContain("if (e.key === 'Escape') setIsMobileOpen(false)");
    expect(layout).toContain("document.addEventListener('keydown', onKey)");
    expect(layout).toContain("document.removeEventListener('keydown', onKey)");
  });

  it('keeps all three exits off desktop, where the sidebar covers nothing', () => {
    expect(layout).toContain('md:hidden');
    const closeBtn = layout.slice(layout.indexOf('aria-label="Close menu"'));
    expect(closeBtn.slice(0, 300)).toContain('md:hidden');
  });

  it('renders the backdrop only while open, so it cannot block a closed page', () => {
    expect(layout).toContain('{isMobileOpen && (');
  });
});
