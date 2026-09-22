import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// closingLabel used to be re-derived client-side, always defaulting to
// "Mile N" for MILE scheme regardless of how close the closing segment's
// own distance actually was to a whole mile — correct for a 5K (1.107mi
// left), wrong for a 4200m (0.61mi left after two full miles, which read
// as "Mile 3" anyway). It's now computed once, backend-side
// (lib/splitMath.js's closingSegmentLabel), from the same markers the
// rest of the response already used.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('SplitsEntryPage.tsx'));

describe('closing-segment label', () => {
  it('reads the backend-computed label rather than re-deriving one from scheme + marker count', () => {
    expect(page).toContain("const closingLabel = data?.closingLabel ?? 'Final';");
  });

  it('no longer recomputes a "Mile N" / "NK" convention on its own', () => {
    expect(page).not.toContain('`Mile ${markers.length + 1}`');
    expect(page).not.toContain('`${markers.length + 1}K`');
  });
});
