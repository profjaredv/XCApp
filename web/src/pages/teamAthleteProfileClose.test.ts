import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The X on this page's full-screen athlete modal used to no-op — this page
// renders AthleteDetailModal as its whole body, and the modal's own fixed
// inset-0 overlay covers the "Back to Team" header underneath it, so the X
// (and clicking the backdrop) was the ONLY thing on screen that could have
// closed it. It did nothing.

const source = fs.readFileSync(path.join(__dirname, 'TeamAthleteProfilePage.tsx'), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
  .join('\n');

describe('closing the athlete profile', () => {
  it('wires the modal close to the same place Back to Team goes', () => {
    expect(code).toContain('onClose={handleBack}');
    expect(code).not.toMatch(/onClose=\{\(\)\s*=>\s*\{\}\}/);
  });
});
