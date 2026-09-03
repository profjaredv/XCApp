import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// "Exit preview" has to land somewhere real for a coach — see
// lib/impersonation.test.ts for the bug this closes.

const source = fs.readFileSync(path.join(__dirname, 'ImpersonationBanner.tsx'), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
  .join('\n');

describe('exit preview', () => {
  it('sends the coach to a real destination, not a bare reload', () => {
    expect(code).toContain("clearPreviewAthlete(teamPath('/roster'))");
    // The bare call is the exact regression: it defaults to reloading
    // wherever preview happened to be showing, which is always /me.
    expect(code).not.toContain('clearPreviewAthlete()');
  });
});
