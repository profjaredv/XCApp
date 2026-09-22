import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Deleting a meet unlinks its races rather than deleting them (DELETE
// /meet-ops/:meetId — see hooks/useMeetOps.ts's useDeleteMeet). A coach
// who deletes a meet WITHOUT first deleting its races is left with
// orphaned heats: no meet to open them from (MeetDetailPage is only
// reachable via a Meet), yet still showing up in Season > Meets, which
// groups by name+date even when unlinked (lib/meetMapping.js). The
// "Import from races" dialog already lists every unlinked race for the
// season — it's the one place a coach can reach them — so deletion lives
// there too, rather than adding a whole new screen for it.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('MeetsPage.tsx'));
const dialog = page.slice(page.indexOf('const ImportMeetsDialog'), page.indexOf('interface CalendarImportRow'));

describe('deleting orphaned races from the import dialog', () => {
  it('offers a delete action on every proposed row, not just import', () => {
    expect(dialog).toContain('onClick={() => handleDeleteRow(row, i)}');
  });

  it('confirms before deleting, naming the race count', () => {
    const handler = dialog.slice(dialog.indexOf('const handleDeleteRow ='), dialog.indexOf('const selectedCount ='));
    expect(handler).toContain('window.confirm(');
    expect(handler).toContain('`Delete ${count} race${count === 1');
    expect(handler).toContain('This cannot be undone.');
  });

  it('deletes through the existing manual-only race endpoint, one call per race in the group', () => {
    const handler = dialog.slice(dialog.indexOf('const handleDeleteRow ='), dialog.indexOf('const selectedCount ='));
    expect(handler).toContain('for (const raceId of row.raceIds)');
    expect(handler).toContain('await deleteRace.mutateAsync(raceId)');
  });

  it('never throws away a scraped race — a failed delete is swallowed, not surfaced as an error that stops the loop', () => {
    const handler = dialog.slice(dialog.indexOf('const handleDeleteRow ='), dialog.indexOf('const selectedCount ='));
    const tryCatch = handler.slice(handler.indexOf('try {'), handler.indexOf('const skipped ='));
    expect(tryCatch).toContain('catch {');
  });

  it('reports a full miss (nothing manual in the group) as an error, not a false success', () => {
    const handler = dialog.slice(dialog.indexOf('const handleDeleteRow ='), dialog.indexOf('const selectedCount ='));
    expect(handler).toContain('if (deleted === 0) {');
    expect(handler).toContain("toast.error(\"Couldn't delete");
  });

  it('re-fetches proposals after deleting rather than guessing the new state locally', () => {
    const handler = dialog.slice(dialog.indexOf('const handleDeleteRow ='), dialog.indexOf('const selectedCount ='));
    expect(handler).toContain('proposeImport.mutate(undefined, {');
  });

  it('disables the row being deleted, and blocks starting a second delete while one is in flight', () => {
    expect(dialog).toContain('disabled={deletingIndex === i}');
    expect(dialog).toContain('disabled={deletingIndex !== null}');
  });
});
