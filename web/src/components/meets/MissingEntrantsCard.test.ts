import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// No jsdom in this project (see vitest.config.ts) — source-scanned like
// every other component test here rather than mounted.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const card = code(read('MissingEntrantsCard.tsx'));

describe('MissingEntrantsCard', () => {
  it('checks against every race at the meet, not just one', () => {
    expect(card).toContain("from '@/hooks/useMeetOps'");
    expect(card).toContain('useMeetEntrants(meetId)');
    const union = card.slice(card.indexOf('const enteredAnywhere'), card.indexOf('const notEntered'));
    expect(union).toContain('meetEntrants?.races.forEach((race) => race.entrants.forEach((e) => set.add(e.athleteId)))');
  });

  it('is the roster minus whoever is entered anywhere, not entrants minus something', () => {
    const notEntered = card.slice(card.indexOf('const notEntered'), card.indexOf('const races ='));
    expect(notEntered).toContain('roster');
    expect(notEntered).toContain('!enteredAnywhere.has(a.id)');
  });

  it('renders nothing when the meet has no races yet — nothing to check against', () => {
    expect(card).toContain('if (races.length === 0) return null');
  });

  it('shows a clear all-clear state distinct from the missing-athletes list', () => {
    expect(card).toContain('notEntered.length === 0');
    expect(card).toContain('Everyone on the roster is entered in at least one race.');
  });

  it('requires an explicit race choice before Add is enabled — no default that could silently add to the wrong race', () => {
    expect(card).toContain("useState<Record<string, string>>({})");
    expect(card).toContain('disabled={!raceChoice[athlete.id]');
  });

  it('adds through the shared per-race-at-click-time mutation, not the single-race hook', () => {
    expect(card).toContain('useAddEntrantToRace');
    expect(card).toContain('addToRace.mutateAsync({ raceId, athleteId })');
  });

  it('tracks the in-flight row separately from the mutation\'s own isPending, so one Add does not freeze every row', () => {
    // addToRace.isPending is one flag shared by the whole card (a single
    // mutation instance) — without per-row tracking, clicking Add on one
    // athlete would show every other row's button as pending too.
    expect(card).toContain('const [submittingId, setSubmittingId] = useState<string | null>(null)');
    expect(card).toContain('submittingId === athlete.id');
    expect(card).not.toContain('disabled={!raceChoice[athlete.id] || addToRace.isPending}');
  });

  it('keeps the athlete name from being squeezed by the trailing controls, same fix as the entrants grid', () => {
    expect(card).toContain('min-w-0 flex-1 truncate');
    expect(card).toContain('shrink-0');
  });
});
