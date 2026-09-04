import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The bug: "timer starts but tapping doesn't register." Every tap in
// Timer mode (IntervalTimerPanel) and every typed time in Manual mode both
// save through useUpdateIntervalEntry — but that mutation only ever
// invalidated the LIST query (['intervalSessions', seasonId]), never the
// single-session query (['intervalSession', id]) the Manage page actually
// renders session.entries from. Manual mode never noticed because
// SplitCell keeps its own local `digits` state regardless of what the
// query cache says; Timer mode's tap buttons read `recorded` straight
// from session.entries, with no such local state to paper over it — so a
// save that genuinely reached the server never became visible on screen.
//
// useAddIntervalEntry/useRemoveIntervalEntry already had this exact fix
// (see their own comment in useIntervalSessions.ts, describing the same
// bug class for adding/removing an athlete) — useUpdateIntervalEntry was
// just never given it.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const hooks = code(read('hooks/useIntervalSessions.ts'));

function bodyOf(fnName: string): string {
  const start = hooks.indexOf(`export function ${fnName}(`);
  expect(start, `${fnName} not found`).toBeGreaterThan(-1);
  const nextExport = hooks.indexOf('export function', start + 1);
  return hooks.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe('interval entry saves become visible on the Manage page', () => {
  it('invalidates the single-session query a save was made against, not only the list', () => {
    const body = bodyOf('useUpdateIntervalEntry');
    expect(body).toContain('useInvalidateSingleSession');
    expect(body).toMatch(/onSuccess:\s*\(\)\s*=>\s*\{[\s\S]*invalidate\(\);[\s\S]*invalidateSession\(\);[\s\S]*\}/);
  });

  it('matches the same fix already applied to add/remove entry', () => {
    const add = bodyOf('useAddIntervalEntry');
    const remove = bodyOf('useRemoveIntervalEntry');
    expect(add).toContain('invalidateSession()');
    expect(remove).toContain('invalidateSession()');
  });
});
