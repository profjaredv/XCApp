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
  it('labels findings in words a sixteen-year-old reads without translating', () => {
    // "Already in you" and "Ceiling" were accurate and meant nothing.
    expect(page).toContain('"You\'ve done this"');
    expect(page).toContain("ceiling: 'If you paced it perfectly'");
    expect(page).not.toContain("'Already in you'");
  });

  it('puts the splits to run at the top, before the reasoning', () => {
    // This is the part that goes to the start line.
    expect(page).toContain('Run these splits');
    expect(page).toContain('strategy.plan.splits.map');
    const splitsAt = page.indexOf('Run these splits');
    const findingsAt = page.indexOf('Where the time is');
    expect(splitsAt).toBeGreaterThan(-1);
    expect(splitsAt).toBeLessThan(findingsAt);
  });

  it('gives one thing to do on race day', () => {
    expect(page).toContain('On race day');
    expect(page).toContain('strategy.instruction');
  });

  it('reads its numbers from the server rather than working them out itself', () => {
    // One set of rules, in lib/raceStrategy.js, tested without a browser.
    // The pacing ceiling is stated inside the finding that owns it now,
    // rather than as a second page-level total nobody could place.
    expect(page).toContain('strategy.measuredTotalSec');
    expect(page).toContain('strategy.plan.splits');
    expect(page).not.toMatch(/levers\.reduce|\.reduce\(\(sum/);
  });

  it('says the numbers come from their own races', () => {
    expect(page).toContain('races {data.athlete.name} has already run');
    expect(page).toContain('Races this is based on');
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
