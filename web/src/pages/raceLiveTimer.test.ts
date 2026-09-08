import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Live Timer, rewritten to match Interval Sessions' Timer mode: start
// one stopwatch, tap a name the moment they finish. Requires race entrants
// (backend MeetEntry, reused) to exist first — see ManageEntrantsDialog
// and routes/meetOps.js's GET/POST/DELETE /races/:raceId/entrants.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/RaceLiveTimerPage.tsx'));
const dialog = code(read('components/meets/ManageEntrantsDialog.tsx'));
const meetDetail = code(read('pages/MeetDetailPage.tsx'));

describe('race live timer', () => {
  it('has no old two-phase capture/assign state left — a single stopwatch instead', () => {
    expect(page).not.toContain("'idle' | 'running' | 'paused' | 'review'");
    expect(page).not.toContain('captures');
    expect(page).not.toContain('SlideToConfirm');
    expect(page).toContain("useState<'idle' | 'running'>('idle')");
  });

  it('prompts to add entrants first when there are none, rather than falling back to the whole roster', () => {
    expect(page).toContain('entrants.length === 0');
    expect(page).toContain('No entrants yet');
    expect(page).toContain('setEntrantsDialogOpen(true)');
  });

  it('taps into the entrants list, not the whole team roster', () => {
    expect(page).toContain('useRaceEntrants(raceId ?? null)');
    expect(page).toContain('entrants.map((entrant) =>');
  });

  it('records the elapsed time on tap, and saves through the same batch endpoint manual entry uses', () => {
    expect(page).toContain('Math.round(elapsedMs / 1000)');
    expect(page).toContain('submitResults.mutate([{ athleteId, time }]');
  });

  it('paints a tap instantly rather than waiting on the network, same fix as interval timer mode', () => {
    expect(page).toContain('const [pendingByAthlete, setPendingByAthlete] = useState');
    const save = page.slice(page.indexOf('const save = '), page.indexOf('const handleRecord ='));
    expect(save.indexOf('setPendingByAthlete')).toBeLessThan(save.indexOf('submitResults.mutate'));
    expect(save).toContain('onSuccess: () => clearPending(athleteId)');
    expect(save).toContain('onError: () => {');
  });

  it('lets an unexpected runner be added mid-timer, not only from the entrants dialog', () => {
    expect(page).toContain("from '@/components/groups/AthletePicker'");
    expect(page).toContain('onPick={handleAddEntrant}');
  });

  it('no longer imports anything from the removed timer-session drafts', () => {
    expect(page).not.toContain('useTimerSessions');
    expect(page).not.toContain('useDeleteTimerSession');
    expect(page).not.toContain('TimerSessionDraft');
  });

  it('defaults to fastest-first, with first/last name as alternatives, for finding one name in a big field', () => {
    expect(page).toContain("useState<'fastest' | 'first' | 'last'>('fastest')");
    expect(page).toContain("{ value: 'fastest', label: 'Fastest' }");
    expect(page).toContain("{ value: 'first', label: 'First name' }");
    expect(page).toContain("{ value: 'last', label: 'Last name' }");
  });

  it('ranks fastest-first by the shared 5K-preferred pace helper, not a duplicate of it', () => {
    expect(page).toContain("from '@/api/groupService'");
    expect(page).toContain('fastestFirstPaceSecPerMile(athlete)');
  });

  it('sorts without touching recorded/pending state, so re-sorting cannot un-mark a tapped name', () => {
    // timeFor and pendingByAthlete are both keyed by athleteId and read
    // from sortedEntrants the same as entrants — sorting only reorders the
    // array sortedEntrants is built from, never rewrites those maps.
    const sortBlock = page.slice(page.indexOf('const sortedEntrants = useMemo'), page.indexOf('const enteredIds ='));
    expect(sortBlock).not.toContain('setPendingByAthlete');
    expect(sortBlock).not.toContain('clearPending');
    expect(page).toContain('sortedEntrants.map((entrant) =>');
  });

  it('renders the grid from the sorted list, not the raw entrants order', () => {
    expect(page).not.toContain('{entrants.map((entrant) => {');
  });
});

describe('race entrants', () => {
  it('lets a coach add and remove entrants from the season roster', () => {
    expect(dialog).toContain("from '@/hooks/useMeetOps'");
    expect(dialog).toContain('useAddEntrant');
    expect(dialog).toContain('useRemoveEntrant');
    expect(dialog).toContain("from '@/components/groups/AthletePicker'");
  });

  it('warns past a typical varsity field size without blocking it', () => {
    expect(dialog).toContain('VARSITY_ENTRY_CAP = 7');
    expect(dialog).toContain('entrants.length > VARSITY_ENTRY_CAP');
  });

  it('is reachable from the meet detail page, next to the other per-race actions', () => {
    expect(meetDetail).toContain("from '@/components/meets/ManageEntrantsDialog'");
    expect(meetDetail).toContain('setEntrantsOpen(true)');
  });

  it('populates a whole heat with checkboxes and one bulk add, not one click per athlete', () => {
    expect(dialog).toContain("from '@/components/ui/checkbox'");
    expect(dialog).toContain('checked={selected.has(a.id)}');
    expect(dialog).toContain('onCheckedChange={() => toggleSelected(a.id)}');
    expect(dialog).toContain('Promise.allSettled(ids.map((athleteId) => addEntrant.mutateAsync(athleteId)))');
  });

  it('still offers a single-name quick add for the straggler after a heat is already set up', () => {
    const bulkSectionEnd = dialog.indexOf('Add one more');
    expect(bulkSectionEnd).toBeGreaterThan(-1);
    const afterBulk = dialog.slice(bulkSectionEnd);
    expect(afterBulk).toContain('<AthletePicker');
    expect(afterBulk).toContain('onPick={handleAdd}');
  });

  it('can narrow the bulk grid by name and by gender for a big roster', () => {
    expect(dialog).toContain('matchesQuery(a.preferredName || a.name, bulkQuery)');
    expect(dialog).toContain("genderFilter !== 'ALL' && a.gender !== genderFilter");
  });

  it('can narrow the bulk grid by best mile pace — "boys faster than 6:15" — in either direction', () => {
    expect(dialog).toContain("paceDirection === 'faster' ? a.pace < paceThresholdSec : a.pace > paceThresholdSec");
    expect(dialog).toContain('parseTimeToSeconds(paceInput)');
  });

  it('never hides an athlete with no time on record behind the pace filter — labels them instead', () => {
    const filterBlock = dialog.slice(dialog.indexOf('const filteredForBulk = useMemo'), dialog.indexOf('const toggleSelected'));
    // The pace comparison only ever runs when BOTH a threshold is set and
    // this athlete has a pace to compare — anyone with a.pace == null
    // falls through every branch to the final `return true`.
    expect(filterBlock).toContain('paceThresholdSec != null && a.pace != null');
    expect(dialog).toContain("a.pace != null ? formatTime(a.pace) : 'no time on record'");
  });
});
