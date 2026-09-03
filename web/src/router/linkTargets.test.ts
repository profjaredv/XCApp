import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Every in-app link must land on a route.
//
// Written after shipping a Strategy Session with buttons on two screens and
// no route behind them: both buttons were tested, the page compiled, and
// clicking either one 404'd. Testing that a link exists and testing that it
// goes somewhere are different tests, and only the first one had been
// written.
//
// This walks every teamPath('/...') in the app and checks it against the
// router's own path list, so the next page wired up without a route fails
// here instead of in a coach's browser.

const SRC = path.join(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** ':id' and '${athleteId}' are the same thing to a router. */
function normalize(target: string): string {
  return target
    .replace(/\$\{\}/g, ':param')
    .replace(/\$\{[^}]*\}/g, ':param')
    .replace(/:[A-Za-z][A-Za-z0-9]*/g, ':param')
    .replace(/[?#].*$/, '')
    // Two interpolations with no slash between them are one path segment:
    // `${athleteId}${season ? '?season=…' : ''}` is still :athleteId to a
    // router, and the tail is a query string it never sees.
    .replace(/(:param)+/g, ':param')
    .replace(/^\/+|\/+$/g, '');
}

const routerSource = fs.readFileSync(path.join(SRC, 'router', 'index.tsx'), 'utf8');
const routePaths = new Set(
  [...routerSource.matchAll(/path:\s*'([^']+)'/g)].map((m) => normalize(m[1]))
);

/**
 * Read one string literal starting at `start`, respecting `${...}`
 * interpolations that themselves contain quotes — a regex stops at the
 * first inner quote and yields a target that never existed.
 */
function readLiteral(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== '`' && quote !== "'" && quote !== '"') return null;
  let out = '';
  let depth = 0;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (depth === 0 && char === quote) return out;
    if (char === '$' && source[i + 1] === '{') {
      depth += 1;
      i += 1;
      out += '${';
      continue;
    }
    if (depth > 0 && char === '{') depth += 1;
    if (depth > 0 && char === '}') {
      depth -= 1;
      out += '}';
      continue;
    }
    if (depth === 0) out += char;
  }
  return null;
}

// Link targets, from every teamPath(...) call in the app.
const linkTargets = new Set<string>();
for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/teamPath\(\s*/g)) {
    const literal = readLiteral(source, match.index! + match[0].length);
    if (literal !== null) linkTargets.add(normalize(literal));
  }
}

describe('in-app links', () => {
  it('finds links to check', () => {
    // A guard on the guard: if the scan silently matched nothing, every
    // assertion below would pass while testing nothing at all.
    expect(linkTargets.size).toBeGreaterThan(15);
    expect(routePaths.size).toBeGreaterThan(15);
  });

  it('every teamPath target has a route', () => {
    const orphans = [...linkTargets].filter((target) => target !== '' && !routePaths.has(target));
    expect(orphans, `these links have no route: ${orphans.join(', ')}`).toEqual([]);
  });

  it('routes the strategy session both entry points link to', () => {
    expect(routePaths.has('athlete/:param/strategy')).toBe(true);
  });
});
