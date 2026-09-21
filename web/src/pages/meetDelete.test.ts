import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A coach had no way to remove a meet they created by mistake. Adding one
// is easy; the part worth pinning down is that the screen tells the truth
// about what it does. Deleting a meet keeps every race, result, split and
// entrant — the backend clears Race.meetId rather than deleting rows — so
// a bare "delete this meet and all its data?" would be a lie in the
// frightening direction, and a bare "delete?" would be a lie in the
// careless one.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/MeetDetailPage.tsx'));
const service = code(read('api/meetOpsService.ts'));
const hooks = code(read('hooks/useMeetOps.ts'));

describe('deleting a meet', () => {
  it('is reachable from the meet a coach is looking at', () => {
    expect(page).toContain('Delete meet');
    expect(page).toContain('onClick={handleDeleteMeet}');
  });

  it('confirms before deleting, naming the meet', () => {
    expect(page).toContain('window.confirm(`Delete "${meet.name}"?');
    expect(page).toContain('This cannot be undone.');
  });

  it('says in the confirmation that the races and results survive', () => {
    const handler = page.slice(page.indexOf('const handleDeleteMeet ='), page.indexOf('const handleDeleteRace ='));
    expect(handler).toContain('every result, split and entrant stay');
    expect(handler).toContain('stop being grouped under this meet');
  });

  it('tells a coach the consequence BEFORE they reach for the button', () => {
    expect(page).toContain('Deleting the meet keeps its {meet.races.length} race');
  });

  it('handles a meet with no races without claiming something survived', () => {
    const handler = page.slice(page.indexOf('const handleDeleteMeet ='), page.indexOf('const handleDeleteRace ='));
    expect(handler).toContain('raceCount === 0');
    expect(handler).toContain('nothing else is affected');
  });

  it('leaves the page it just deleted', () => {
    const handler = page.slice(page.indexOf('const handleDeleteMeet ='), page.indexOf('const handleDeleteRace ='));
    expect(handler).toContain("navigate(teamPath('/meets'))");
  });

  it('reports a failure rather than pretending it worked', () => {
    const handler = page.slice(page.indexOf('const handleDeleteMeet ='), page.indexOf('const handleDeleteRace ='));
    expect(handler).toContain("toast.error('Could not delete that meet.')");
  });

  it('calls the meet endpoint, not a race one', () => {
    expect(service).toContain('await api.delete<{ success: boolean; unlinkedRaceCount: number }>(`/meet-ops/${meetId}`)');
  });

  it('clears the analytics caches too — Season > Meets groups by the meet link', () => {
    const hook = hooks.slice(hooks.indexOf('export function useDeleteMeet'));
    expect(hook).toContain("invalidateQueries({ queryKey: ['meetOps'] })");
    expect(hook).toContain('invalidateAfterDataChange(queryClient)');
  });
});
