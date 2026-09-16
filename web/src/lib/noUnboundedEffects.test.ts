import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A useEffect with NO dependency array runs after every render. That is
// only ever safe if the body touches no state — and the one time it did,
// it called a parent's setState, which re-rendered, which ran the effect
// again: React #185, "maximum update depth exceeded", a white screen on
// the live site.
//
// ESLint cannot catch this. `react-hooks/exhaustive-deps` checks that a
// dep array is COMPLETE; an effect with no array at all is legal syntax
// and passes silently. So it's checked here instead.

const SRC = path.join(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith('.tsx') && !full.includes('.test.') ? [full] : [];
  });
}

/** Line numbers of every useEffect in `src` that was given no dep array. */
function effectsWithoutDeps(src: string): number[] {
  const found: number[] = [];
  for (const match of src.matchAll(/useEffect\(/g)) {
    let i = match.index! + match[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
      i += 1;
    }
    const body = src.slice(match.index! + match[0].length, i - 1);
    let d = 0;
    let hasDeps = false;
    for (let k = 0; k < body.length; k += 1) {
      const ch = body[k];
      if (ch === '(' || ch === '[' || ch === '{') d += 1;
      else if (ch === ')' || ch === ']' || ch === '}') d -= 1;
      else if (ch === ',' && d === 0 && body.slice(k + 1).trimStart().startsWith('[')) {
        hasDeps = true;
        break;
      }
    }
    if (!hasDeps) found.push(src.slice(0, match.index).split('\n').length);
  }
  return found;
}

describe('every useEffect declares its dependencies', () => {
  it('finds no effect without a dependency array anywhere in src', () => {
    const offenders = walk(SRC)
      .map((file) => ({ file: path.relative(SRC, file), lines: effectsWithoutDeps(fs.readFileSync(file, 'utf8')) }))
      .filter((r) => r.lines.length > 0)
      .map((r) => `${r.file}:${r.lines.join(',')}`);

    expect(offenders, 'useEffect with no dependency array — it runs after EVERY render').toEqual([]);
  });

  it('the detector actually detects — a missing array is caught, a present one is not', () => {
    expect(effectsWithoutDeps('useEffect(() => { go(); });')).toEqual([1]);
    expect(effectsWithoutDeps('useEffect(() => { go(); }, []);')).toEqual([]);
    expect(effectsWithoutDeps('useEffect(() => { go(a, [b]); }, [a]);')).toEqual([]);
    // A nested array inside the body must not read as the dep array.
    expect(effectsWithoutDeps('useEffect(() => { const x = [1, 2]; go(x); });')).toEqual([1]);
  });
});
