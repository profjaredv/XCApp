import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Meets publish a distance and revise it later — a "5K" that was actually
// short. Until now nothing could say so: distance was only ever written by
// the scraper import or at race creation.
//
// Re-scraping does not fix it and quietly makes things worse. A Race is
// identified by (teamId, name, date, distance), so a revised distance does
// not match the existing row and the import CREATES A SECOND RACE — the
// original still holding the field results, splits and entrants, the new
// one holding a fresh copy of the results and none of the rest.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const readRepo = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/MeetDetailPage.tsx'));
const hooks = code(read('hooks/useMeetOps.ts'));
const routes = code(readRepo('backend/routes/meetOps.js'));

describe('correcting a race distance', () => {
  it('has an endpoint at all — distance was previously write-once', () => {
    expect(routes).toContain("router.patch('/races/:raceId'");
  });

  it('rejects a missing or non-positive distance instead of storing it', () => {
    const handler = routes.slice(routes.indexOf("router.patch('/races/:raceId'"));
    expect(handler).toContain('!Number.isFinite(distanceMetersNum) || distanceMetersNum <= 0');
  });

  it('moves the label with the number, or a re-scrape still sees the old distance', () => {
    const handler = routes.slice(routes.indexOf("router.patch('/races/:raceId'"));
    expect(handler).toContain('distanceMeters: distanceMetersNum');
    expect(handler).toContain('distance: distance != null && String(distance).trim()');
  });

  it('recalculates the season, since paces are precomputed and would not move on their own', () => {
    const handler = routes.slice(routes.indexOf("router.patch('/races/:raceId'"));
    expect(handler).toContain('calculateAllMetrics(req.user.teamId, race.season)');
  });

  it('explains a name/date/distance collision rather than 500ing', () => {
    const handler = routes.slice(routes.indexOf("router.patch('/races/:raceId'"));
    expect(handler).toContain("error.code === 'P2002'");
  });

  it('is scoped to the caller\'s own team', () => {
    const handler = routes.slice(routes.indexOf("router.patch('/races/:raceId'"));
    expect(handler).toContain('teamId: req.user.teamId');
  });
});

describe('the meet page', () => {
  it('shows each race\'s distance — an invisible number is how a wrong one survives', () => {
    expect(page).toContain("{r.distanceMeters ? `${Math.round(r.distanceMeters)}m` : 'set distance'}");
  });

  it('applies to any race, not just manually created ones', () => {
    // A scraped race is exactly the case this exists for — the Delete
    // button beside it IS isManual-gated, so this must not be.
    const trigger = page.indexOf('setDistanceRace({ id: r.id');
    expect(trigger).toBeGreaterThan(-1);
    const before = page.slice(page.indexOf('meet.races.map((r) => {'), trigger);
    expect(before).not.toContain('r.isManual &&');
  });

  it('warns against re-importing, which would fork a duplicate race', () => {
    expect(page).toContain('a re-import would add a second copy of this race');
  });

  it('invalidates far more than the meet, because every pace depends on it', () => {
    const hook = hooks.slice(hooks.indexOf('export function useUpdateRaceDistance'));
    expect(hook).toContain('invalidateAfterDataChange(queryClient)');
  });
});
