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
    // "captures" itself now legitimately appears (unassignedCaptures, the
    // "Runner not listed" fallback below) — checking for the OLD shape
    // specifically, not the bare word.
    expect(page).not.toContain("'idle' | 'running' | 'paused' | 'review'");
    expect(page).not.toContain('captures: number[]');
    expect(page).not.toContain('assignments: Record<string, string>');
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

  it('shows four columns on an iPad in portrait to cut down on scrolling a big field', () => {
    expect(page).toContain('grid-cols-2 gap-2 sm:grid-cols-3 min-[700px]:grid-cols-4');
  });

  it('shows the entrant count within the race name, both in the header and the "Runner not listed" section', () => {
    expect(page).toContain('`${raceName} (${entrants.length})`');
  });

  it('gives the not-yet-tapped tile a solid, high-contrast look rather than a light bordered box, for outdoor readability', () => {
    const grid = page.slice(page.indexOf('sortedEntrants.map((entrant) => {'), page.indexOf('{/* Times logged with "Runner not listed,"'));
    expect(grid).toContain('border-foreground bg-foreground text-background');
  });

  it('turns a tap gray while the save is in flight, distinct from the not-yet-tapped state', () => {
    const grid = page.slice(page.indexOf('sortedEntrants.map((entrant) => {'), page.indexOf('{/* Times logged with "Runner not listed,"'));
    expect(grid).toContain('border-muted-foreground/40 bg-muted text-muted-foreground');
  });

  it('gives a confirmed, saved tap its own distinct color family — not a re-use of the not-yet-tapped or pending colors', () => {
    const grid = page.slice(page.indexOf('sortedEntrants.map((entrant) => {'), page.indexOf('{/* Times logged with "Runner not listed,"'));
    expect(grid).toContain('border-primary bg-primary text-primary-foreground');
  });

  it('makes "Runner not listed" a solid button, not the low-contrast outline variant', () => {
    // code() strips the block comment right above this button, so anchor
    // on the onClick itself and look at the surrounding markup instead.
    const anchor = page.indexOf('onClick={handleLogUnnamed}');
    const button = page.slice(Math.max(0, anchor - 200), anchor + 250);
    expect(button).not.toContain('variant="outline"');
    expect(button).toContain('Runner not listed — log time only');
  });
});

describe('runner not listed', () => {
  it('is reclickable — no per-press disabled state beyond needing the clock running', () => {
    const handler = page.slice(page.indexOf('const handleLogUnnamed'), page.indexOf('const handleDiscardUnnamed'));
    expect(handler).toContain("if (phase !== 'running') return");
    // Every press appends; nothing here marks a "used" state on the button.
    expect(handler).toContain('setUnassignedCaptures((prev) => [');
    expect(page).toContain('onClick={handleLogUnnamed}');
    expect(page).toContain("disabled={phase !== 'running'}");
  });

  it('logs the time with no name attached, distinct from a normal entrant tap', () => {
    expect(page).toContain('interface UnassignedCapture');
    expect(page).toContain('timeSec: Math.round(elapsedMs / 1000)');
  });

  it('persists unnamed captures per race so a reload cannot lose one still waiting on a name', () => {
    expect(page).toContain('UNASSIGNED_STORAGE_KEY');
    expect(page).toContain('window.localStorage.getItem(UNASSIGNED_STORAGE_KEY(raceId))');
    expect(page).toContain('window.localStorage.setItem(UNASSIGNED_STORAGE_KEY(raceId)');
  });

  it('assigning a name writes a real Result through the same submit path as every other tap', () => {
    const handler = page.slice(page.indexOf('const handleAssignUnnamed'), page.indexOf('const claimedByOtherCaptures'));
    expect(handler).toContain('submitResults.mutate([{ athleteId, time: capture.timeSec }]');
    expect(handler).toContain('onSuccess: () => {');
    expect(handler).toContain('onError: () => {');
  });

  it('can assign to any roster athlete without a time, not only entrants — covers "not listed" and "listed but unfindable" alike', () => {
    expect(page).toContain('const assignableRoster = useMemo(');
    const block = page.slice(page.indexOf('const assignableRoster = useMemo'), page.indexOf('const raceName ='));
    expect(block).toContain('timeFor(a.id) == null');
    expect(block).not.toContain('enteredIds.has');
  });

  it('cannot double-claim the same athlete across two unnamed rows at once', () => {
    expect(page).toContain('const claimedByOtherCaptures = useMemo(');
    expect(page).toContain('!claimedByOtherCaptures.has(a.id)');
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

  it('shows each race\'s entrant count right in its name in the race picker, reusing the meet-wide entrants query', () => {
    expect(meetDetail).toContain('useMeetEntrants');
    expect(meetDetail).toContain('entrantCountByRace');
    const selectItem = meetDetail.slice(meetDetail.indexOf('meet.races.map((r) => {'), meetDetail.indexOf('})}'));
    expect(selectItem).toContain('entrantCountByRace.get(r.id)');
    expect(selectItem).toContain('count != null');
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
    expect(dialog).toContain("a.pace != null ? formatTime(a.pace) : 'no time yet'");
  });

  it('never lets the pace fallback text squeeze an athlete\'s name out of the bulk grid row', () => {
    // Both trailing spans (grade, pace) used to be pinned shrink-0 — on a
    // narrow 2-3 column layout, "no time on record" (much longer than a
    // formatted time like "6:15") could claim the whole row and push the
    // flex-1 name span to zero width. The name now has a guaranteed
    // minimum width, and the pace span is capped and shrinkable instead of
    // being allowed unbounded growth.
    const bulkRow = dialog.slice(dialog.indexOf('<Checkbox checked={selected.has(a.id)}'), dialog.indexOf('</label>'));
    expect(bulkRow).toContain('min-w-[3.5rem] flex-1 truncate');
    expect(bulkRow).toContain('max-w-[6rem] shrink truncate');
    expect(bulkRow).not.toContain('shrink-0 font-mono text-xs text-muted-foreground');
  });

  it('shows each entrant\'s mile PR or average 5K pace, matched to the race they\'re actually entered in', () => {
    expect(dialog).toContain("from '@/api/groupService'");
    expect(dialog).toContain('entrantPaceStat');
    expect(dialog).toContain('raceDistanceMeters');
    const entrantsRow = dialog.slice(dialog.indexOf('entrants.map((entrant) => {'), dialog.indexOf('Add from roster'));
    expect(entrantsRow).toContain('entrantPaceStat(athlete, raceDistanceMeters)');
    expect(entrantsRow).toContain('min-w-0 flex-1 truncate');
    expect(entrantsRow).toContain('`${stat.label} ${formatTime(stat.seconds)}`');
  });
});
