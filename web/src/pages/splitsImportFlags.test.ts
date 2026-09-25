import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A bulk CSV import used to always show "Imported splits for N athletes"
// even when every single cell got rejected by the backend's monotonicity
// check (lib/splitMath.js's validateSplitEntries — one bad EXISTING value
// for an earlier marker silently rejects every later marker an import
// tries to write for that same athlete). The coach saw a success toast,
// reopened the race, and the values they just "imported" were gone —
// nothing ever actually saved, but nothing said so. The flag messages
// also showed raw resultId UUIDs instead of athlete names, so even the
// follow-up error toast couldn't say which row was the problem.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('SplitsEntryPage.tsx'));
const importHandler = page.slice(page.indexOf('const handleFileChange ='), page.indexOf('const topBar ='));

describe('CSV split import — honest success/failure reporting', () => {
  it('counts every cell it actually tries to write, not just matched rows', () => {
    expect(importHandler).toContain('const totalCellsAttempted = entries.reduce((sum, e) => sum + e.splits.length, 0);');
  });

  it('does not claim success when every touched cell was flagged', () => {
    expect(importHandler).toContain('if (totalCellsAttempted > 0 && savedCells <= 0) {');
    expect(importHandler).toContain("toast.error(");
    expect(importHandler).toContain('Nothing was saved');
  });

  it('returns before the success toast when nothing saved, so both never fire together', () => {
    const guard = importHandler.slice(importHandler.indexOf('if (totalCellsAttempted > 0'), importHandler.indexOf("toast.success(`Imported"));
    expect(guard).toContain('return;');
  });

  it('names the athlete and the marker in a flag message, not a raw resultId', () => {
    expect(importHandler).toContain('const nameByResultId = new Map(rowsAll.map((r) => [r.resultId, r.athleteName]));');
    expect(importHandler).toContain('const labelBySequence = new Map(markers.map((m) => [m.sequence, m.label]));');
    expect(importHandler).toContain(
      '`${nameByResultId.get(f.resultId) ?? f.resultId} (${labelBySequence.get(f.sequence) ?? `marker ${f.sequence}`}): ${f.reason}`'
    );
  });

  it('still reports a normal success when at least some cells actually saved', () => {
    expect(importHandler).toContain('toast.success(`Imported splits for ${entries.length} athlete');
  });
});
