import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Everywhere in the app, a faster time or pace sits LOWER on the chart, so
// improvement reads as a line falling. Recharts' `reversed` flips an axis, which
// puts faster at the top; no chart should do that.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('chart direction', () => {
  it('no chart reverses its y axis', () => {
    const offenders = files(join(__dirname, '..')).filter((f) => /<YAxis[^>]*\breversed\b/s.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
