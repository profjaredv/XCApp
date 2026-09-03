import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The strategy session, and the postseason tagging fix that shipped with it.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/StrategyPage.tsx'));
const postseason = code(read('pages/PostSeasonPage.tsx'));

describe('strategy session', () => {
  it('separates what is already in them from what perfect pacing would be worth', () => {
    expect(page).toContain("measured: 'Already in you'");
    expect(page).toContain("ceiling: 'Ceiling'");
    expect(page).toContain('a ceiling is what perfect pacing would be worth, not');
  });

  it('reads the totals from the server rather than adding levers up itself', () => {
    // One set of rules, in lib/raceStrategy.js, tested without a browser.
    expect(page).toContain('strategy.measuredTotalSec');
    expect(page).toContain('strategy.ceilingTotalSec');
    expect(page).not.toMatch(/levers\.reduce/);
  });

  it('says the numbers come from their own races', () => {
    expect(page).toContain("own results — no predictions, no model");
    expect(page).toContain('The races this is built from');
  });

  it('lets the goal and the distance change', () => {
    expect(page).toContain('TARGET_OPTIONS');
    expect(page).toContain('setDistanceMeters');
  });

  it('is reachable by the athlete and by their coach', () => {
    expect(code(read('pages/MyProgressPage.tsx'))).toContain('/strategy');
    expect(code(read('pages/TeamAthleteProfilePage.tsx'))).toContain('/strategy');
  });
});

describe('tagging older seasons', () => {
  it('tags loose races, not only meets', () => {
    // Imported seasons are races with no Meet row — a meet-only worklist
    // is empty for exactly the seasons a coach most wants to tag.
    expect(postseason).toContain("m.kind === 'meet'");
    expect(postseason).toContain('raceIds: m.raceIds');
  });
});
