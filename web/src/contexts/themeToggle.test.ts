import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Dark mode existed as a fully-built, accessibility-validated palette
// (index.css's .dark block) with no way to ever turn it on. This is that
// mechanism: a context/provider pair mirroring NerdModeContext, an inline
// anti-flash script in index.html, and a toggle in the sidebar.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const readRoot = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const provider = code(read('contexts/ThemeProvider.tsx'));
const context = code(read('contexts/ThemeContext.ts'));
const layout = code(read('components/Layout.tsx'));
const main = code(read('main.tsx'));
const html = readRoot('index.html');
const css = read('index.css');

describe('dark mode toggle', () => {
  it('persists the choice under a stable key both the provider and the anti-flash script agree on', () => {
    expect(context).toContain("THEME_STORAGE_KEY = 'xc_theme'");
    expect(html).toContain("localStorage.getItem('xc_theme')");
  });

  it('applies .dark before first paint, not after React mounts', () => {
    // A <script> in <head>, not type="module"/defer — those run after
    // first paint, which is exactly the flash this exists to avoid.
    const scriptTag = html.slice(html.indexOf("localStorage.getItem('xc_theme')") - 200, html.indexOf("localStorage.getItem('xc_theme')"));
    expect(scriptTag).toContain('<script>');
    expect(scriptTag).not.toContain('type="module"');
    expect(scriptTag).not.toContain('defer');
  });

  it('defaults to light, not the OS preference, for anyone who has not chosen yet', () => {
    // Explicit opt-in only — the whole point of the original color-scheme:
    // light fix was to stop the OS's own dark preference from touching
    // this app on its own.
    expect(provider).toContain("localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'");
    expect(provider).not.toContain('prefers-color-scheme');
  });

  it('toggles the .dark class on the document element, not a component-local style', () => {
    expect(provider).toContain("document.documentElement.classList.toggle('dark'");
  });

  it('flips native form controls and scrollbars along with the app palette', () => {
    expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/);
  });

  it('is reachable from the sidebar drawer, same as Nerd mode, so it works on phones and iPad too', () => {
    expect(layout).toContain("from '../contexts/ThemeContext'");
    expect(layout).toContain('toggleTheme');
    expect(layout).toContain('Dark mode');
    const themeButtonAt = layout.indexOf('onClick={toggleTheme}');
    const nerdButtonAt = layout.indexOf('onClick={toggleNerdMode}');
    expect(themeButtonAt).toBeGreaterThan(-1);
    expect(nerdButtonAt).toBeGreaterThan(-1);
  });

  it('is mounted above the router, so it reaches full-screen routes outside Layout too', () => {
    expect(main).toContain('<ThemeProvider>');
    const providerAt = main.indexOf('<ThemeProvider>');
    const routerAt = main.indexOf('<RouterProvider');
    expect(providerAt).toBeLessThan(routerAt);
  });
});
