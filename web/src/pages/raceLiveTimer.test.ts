import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Live Timer, capture-first: the big button takes no name, every press
// appends a finish at the current elapsed time, and naming is a second
// pass afterwards. Name-first failed in the field — you cannot scan sixty
// names at a chute, and a missed tap is a time that cannot be recovered.
// Tapping a name mid-race still works; it is the same capture arriving
// with its athleteId already set. See lib/captureTimer.ts (which holds the
// ordering/assignment logic, with its own unit tests).

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
const resultsGrid = code(read('pages/ResultsGridPage.tsx'));

describe('race live timer', () => {
  it('has a stopped phase distinct from idle, so the naming pass keeps the clock and captures on screen', () => {
    expect(page).not.toContain("'idle' | 'running' | 'paused' | 'review'");
    expect(page).not.toContain('SlideToConfirm');
    expect(page).toContain("useState<'idle' | 'running' | 'stopped'>('idle')");
  });

  it('prompts to add entrants first when there are none, rather than falling back to the whole roster', () => {
    expect(page).toContain('entrants.length === 0');
    expect(page).toContain('No entrants yet');
    expect(page).toContain('setEntrantsDialogOpen(true)');
  });

  it('taps into the entrants list, not the whole team roster', () => {
    expect(page).toContain('useRaceEntrants(raceId ?? null)');
    expect(page).toContain('gridEntrants.map((entrant) =>');
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
    const sortBlock = page.slice(page.indexOf('const sortedEntrants = useMemo'), page.indexOf('const timedElsewhere ='));
    expect(sortBlock).not.toContain('setPendingByAthlete');
    expect(sortBlock).not.toContain('clearPending');
    expect(page).toContain('gridEntrants.map((entrant) =>');
  });

  it('renders the grid from the sorted list, not the raw entrants order', () => {
    expect(page).not.toContain('{entrants.map((entrant) => {');
    expect(page).toContain('const sortedEntrants = useMemo');
  });

  it('shows four columns on an iPad in portrait to cut down on scrolling a big field', () => {
    expect(page).toContain('grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4');
  });

  it('uses a named breakpoint, not an arbitrary one, for the 4-column jump', () => {
    // An arbitrary min-[Npx] breakpoint's media block isn't guaranteed to
    // land after sm's in the compiled CSS — it landed BEFORE here, so
    // sm:grid-cols-3 (same specificity, later in the stylesheet) kept
    // winning the cascade tie past 700px and iPads stayed stuck at 3
    // columns despite the class being "correct." Named breakpoints
    // (sm/md/lg) are the only ones Tailwind guarantees to compile in
    // ascending order.
    expect(page).not.toContain('min-[700px]');
  });

  it('shows the entrant count within the race name in the header', () => {
    expect(page).toContain('`${raceName} (${entrants.length})`');
  });

  it('gives the not-yet-tapped tile a solid, high-contrast look rather than a light bordered box, for outdoor readability', () => {
    const grid = page.slice(page.indexOf('gridEntrants.map((entrant) => {'), page.indexOf('{assigningId && gridEntrants.length === 0'));
    expect(grid).toContain('border-foreground bg-foreground text-background');
  });

  it('turns a tap gray while the save is in flight, distinct from the not-yet-tapped state', () => {
    const grid = page.slice(page.indexOf('gridEntrants.map((entrant) => {'), page.indexOf('{assigningId && gridEntrants.length === 0'));
    expect(grid).toContain('border-muted-foreground/40 bg-muted text-muted-foreground');
  });

  it('gives a confirmed, saved tap its own distinct color family — not a re-use of the not-yet-tapped or pending colors', () => {
    const grid = page.slice(page.indexOf('gridEntrants.map((entrant) => {'), page.indexOf('{assigningId && gridEntrants.length === 0'));
    expect(grid).toContain('border-primary bg-primary text-primary-foreground');
  });

  it('makes FINISH the biggest, most obvious target on the page', () => {
    const anchor = page.indexOf('onClick={handleFinish}');
    expect(anchor).toBeGreaterThan(-1);
    const button = page.slice(Math.max(0, anchor - 300), anchor + 600);
    expect(button).toContain('h-28 w-full');
    expect(button).toContain('bg-primary text-primary-foreground');
    expect(button).toContain('Finish');
  });
});

describe('capture-first timing', () => {
  it('the primary button records a time with no name at all', () => {
    const handler = page.slice(page.indexOf('const handleFinish ='), page.indexOf('const handleAssign ='));
    expect(handler).toContain("if (phase !== 'running') return");
    expect(handler).toContain('athleteId: null');
    expect(handler).toContain('timeSec: Math.round(elapsedMs / 1000)');
  });

  it('is reclickable — nothing marks the button used, one press per runner crossing', () => {
    const anchor = page.indexOf('onClick={handleFinish}');
    const button = page.slice(anchor, anchor + 400);
    expect(button).toContain("disabled={phase !== 'running'}");
    expect(button).not.toContain('disabled={pending');
  });

  it('a name tapped mid-race is the same capture, already named — not a second mechanism', () => {
    const handler = page.slice(page.indexOf('const handleRecordNow ='), page.indexOf('const handleClearAthlete ='));
    expect(handler).toContain('athleteId }');
    expect(handler).toContain('save(athleteId, timeSec)');
  });

  it('persists captures per race so a reload mid-heat cannot lose a time', () => {
    expect(page).toContain('CAPTURES_STORAGE_KEY');
    expect(page).toContain('window.localStorage.getItem(CAPTURES_STORAGE_KEY(raceId))');
    expect(page).toContain('window.localStorage.setItem(CAPTURES_STORAGE_KEY(raceId)');
  });

  it('Reset clears the clock but never the captures', () => {
    const handler = page.slice(page.indexOf('const handleReset ='), page.indexOf('const resultByAthlete ='));
    expect(handler).toContain('setElapsedMs(0)');
    expect(handler).not.toContain('setCaptures');
  });

  it('naming a capture writes a real Result through the same submit path as every other tap', () => {
    const handler = page.slice(page.indexOf('const handleAssign ='), page.indexOf('const handleRecordNow ='));
    expect(handler).toContain('save(athleteId, capture.timeSec)');
  });

  it('clears the displaced row\'s saved time when an athlete is moved between captures', () => {
    // assignCapture frees the athlete from whichever row held them; the
    // result already written for that row has to go too, or a stale time
    // is left on the server for a runner who has since been re-placed.
    const handler = page.slice(page.indexOf('const handleAssign ='), page.indexOf('const handleRecordNow ='));
    expect(handler).toContain('const displaced =');
    expect(handler).toContain('if (displaced) save(athleteId, null)');
  });

  it('clearing a name keeps the time, as an unnamed row', () => {
    const handler = page.slice(page.indexOf('const handleClearAthlete ='), page.indexOf('const handleDeleteCapture ='));
    expect(handler).toContain('unassignCapture');
    expect(handler).toContain('save(athleteId, null)');
    expect(handler).not.toContain('removeCapture');
  });

  it('targets the earliest unnamed row automatically once the clock stops, so naming needs no setup tap', () => {
    expect(page).toContain("const autoTargetId = phase === 'running' ? null : nextUnnamedId(captures)");
  });

  it('never silently changes what a name tap does — the mode is stated on screen', () => {
    expect(page).toContain('Naming <span className="font-medium">#{assigningPlace}</span>');
    expect(page).toContain('Tapping a name records their finish now.');
  });

  it('offers only athletes still unaccounted for during the naming pass', () => {
    expect(page).toContain('remainingBy(sortedEntrants, captures, timedElsewhere, (e) => e.athleteId)');
  });

  it('can name from the whole roster, not only entrants — a walk-on was never declared', () => {
    const block = page.slice(page.indexOf('const assignableRoster = useMemo'), page.indexOf('const placed = useMemo'));
    expect(block).toContain('remainingAthletes(');
    expect(block).not.toContain('enteredIds.has');
  });

  it('shows the finish order with places that count unnamed runners too', () => {
    expect(page).toContain('const placed = useMemo(() => orderCaptures(captures), [captures])');
    expect(page).toContain('{capture.place}');
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

  it('shows each race\'s entrant count next to its name, reusing the meet-wide entrants query', () => {
    expect(meetDetail).toContain('useMeetEntrants');
    expect(meetDetail).toContain('entrantCountByRace');
    const raceRow = meetDetail.slice(meetDetail.indexOf('meet.races.map((r) => {'), meetDetail.indexOf('<ReflectionsView raceId={r.id} />'));
    expect(raceRow).toContain('entrantCountByRace.get(r.id)');
    expect(raceRow).toContain('count != null');
  });

  it('lists every race as its own row with its own buttons, not one race behind a dropdown', () => {
    // A dropdown hid every race but the one selected — a coach with
    // several races at a meet (varsity/JV x boys/girls, easily) wants to
    // see the whole list and reach any of them without a menu in the way.
    expect(meetDetail).not.toContain('<Select value={selectedRaceId');
    expect(meetDetail).not.toContain('Choose a race…');
    const raceRow = meetDetail.slice(meetDetail.indexOf('meet.races.map((r) => {'), meetDetail.indexOf('<ReflectionsView raceId={r.id} />'));
    expect(raceRow).toContain("onClick={() => navigate(teamPath(`/race/${r.id}/timer`))}");
    expect(raceRow).toContain('setEntrantsOpen(true)');
    expect(raceRow).toContain('setImportResultsOpen(true)');
    expect(raceRow).toContain('setEnterResultsOpen(true)');
    expect(raceRow).toContain("onClick={() => navigate(teamPath(`/race/${r.id}/splits`))}");
  });

  it('deletes the race a row\'s own delete button targets, not whichever race a dialog last touched', () => {
    expect(meetDetail).toContain('const handleDeleteRace = async (raceId: string) => {');
    expect(meetDetail).toContain('onClick={() => handleDeleteRace(r.id)}');
  });

  it('shows each race\'s shared reflections under its own row, not just whichever one was last selected', () => {
    const raceRow = meetDetail.slice(meetDetail.indexOf('meet.races.map((r) => {'), meetDetail.indexOf('<ReflectionsView raceId={r.id} />') + 40);
    expect(raceRow).toContain('<ReflectionsView raceId={r.id} />');
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

describe('meet results export', () => {
  it('combines every race in the meet into one CSV, joined with athlete info the per-race results endpoint deliberately omits', () => {
    expect(meetDetail).toContain('meetOpsService.getMeetResults(meet.id)');
    expect(meetDetail).toContain("from '@/lib/csvParse'");
    const handler = meetDetail.slice(meetDetail.indexOf('const handleExportCsv ='), meetDetail.indexOf('return (\n    <div className="space-y-6">'));
    expect(handler).toContain("'Race', 'Name', 'Grade', 'Gender', 'Time', 'Status'");
    expect(handler).toContain('downloadCsv(');
  });

  it('only offers the export once there is at least one race to combine', () => {
    const button = meetDetail.slice(meetDetail.indexOf('onClick={handleExportCsv}') - 100, meetDetail.indexOf('onClick={handleExportCsv}') + 50);
    expect(button).toContain('meet.races.length > 0');
  });

  it('exports exactly the filtered/sorted rows on screen, not the whole unfiltered season', () => {
    expect(resultsGrid).toContain("from '@/lib/csvParse'");
    const handler = resultsGrid.slice(resultsGrid.indexOf('const handleExportCsv ='), resultsGrid.indexOf('const handleSort ='));
    expect(handler).toContain('processedAthletes.map(');
    expect(handler).not.toContain('gridData.athletes.map(');
  });

  it('disambiguates a race name that recurs across the season instead of letting columns collide', () => {
    const handler = resultsGrid.slice(resultsGrid.indexOf('const handleExportCsv ='), resultsGrid.indexOf('const handleSort ='));
    expect(handler).toContain('dedupeColumnLabels(gridData.races)');
  });

  it('exports a blank entrants sheet to fill in by hand, ready to type or paste back in later', () => {
    expect(dialog).toContain("from '@/lib/csvParse'");
    const handler = dialog.slice(dialog.indexOf('const handleExportCsv ='), dialog.indexOf('return ('));
    expect(handler).toContain("'Name', 'Grade', 'Gender', 'Time', 'Status'");
    expect(handler).toContain('entrants.map(');
    expect(handler).toContain("Time: ''");
    expect(handler).toContain("Status: ''");
    expect(handler).toContain('downloadCsv(');
  });

  it('disables the entrants export until there is actually an entrant to export', () => {
    const button = dialog.slice(dialog.indexOf('onClick={handleExportCsv}') - 60, dialog.indexOf('onClick={handleExportCsv}') + 80);
    expect(button).toContain('disabled={entrants.length === 0}');
  });
});

describe('enter results scoped to the race, not the whole roster', () => {
  const enterResults = meetDetail.slice(
    meetDetail.indexOf('const EnterRaceResultsDialog:'),
    meetDetail.indexOf('export default MeetDetailPage;')
  );

  it('reads the race\'s own entrants, same list the Live Timer and Manage Entrants use', () => {
    expect(enterResults).toContain('useRaceEntrants(open ? raceId : null)');
  });

  it('builds its rows from entrants plus anyone who already has a result, not the entire season roster', () => {
    // A scraped race never goes through the entrants system at all — if
    // rows were entrants-only, every one of its existing results would
    // become invisible (and un-editable) in this dialog.
    const rowIdsBlock = enterResults.slice(enterResults.indexOf('const rowIds = useMemo'), enterResults.indexOf('const rows = useMemo'));
    expect(rowIdsBlock).toContain('entrants.forEach((e) => ids.add(e.athleteId))');
    expect(rowIdsBlock).toContain('(raceResults?.results ?? []).forEach((r) => ids.add(r.athleteId))');
    expect(rowIdsBlock).toContain('addedAthleteIds.forEach((id) => ids.add(id))');
    expect(enterResults).not.toContain('{roster.map((a) => {');
  });

  it('lets a coach add someone beyond entrants/existing-results — a manual race with nobody entered yet still works', () => {
    expect(meetDetail).toContain("from '@/components/groups/AthletePicker'");
    expect(enterResults).toContain('onPick={handleAddAthlete}');
    expect(enterResults).toContain('const [addedAthleteIds, setAddedAthleteIds] = useState<string[]>([])');
  });

  it('resets added-this-session athletes when the dialog reopens, so a stray add from last time can\'t linger', () => {
    const resetEffect = enterResults.slice(enterResults.indexOf('useEffect(() => {\n    if (!open || !raceResults) return;'), enterResults.indexOf('const rosterById'));
    expect(resetEffect).toContain('setAddedAthleteIds([])');
  });

  it('still saves through the same touched-fields-only payload — this is a scoping fix, not a rewrite of the save path', () => {
    const handleSave = enterResults.slice(enterResults.indexOf('const handleSave = async'), enterResults.indexOf('const loading ='));
    expect(handleSave).toContain('touched[id]?.time || touched[id]?.status');
  });
});
