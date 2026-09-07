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
});
