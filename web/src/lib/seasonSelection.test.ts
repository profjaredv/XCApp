import { describe, it, expect } from 'vitest';
import { resolveSeasonSelection, type SeasonInput } from './seasonSelection';

const base = (over: Partial<SeasonInput> = {}): SeasonInput => ({
  activeSeason: 2026,
  selectedSeason: undefined,
  seasonMode: 'current',
  seasonModeExplicit: false,
  availableSeasons: [
    { year: 2026, hasData: true },
    { year: 2025, hasData: true },
  ],
  ...over,
});

describe('first load', () => {
  it('PICKS A SEASON — the regression that broke every dashboard link', () => {
    // With nothing selected and no branch to set it, every query
    // downstream sat on undefined and the page rendered
    // "No team data found." until the user changed the year by hand.
    expect(resolveSeasonSelection(base())).toEqual({ season: 2026 });
  });

  it('still picks one when the active season is the only season', () => {
    expect(
      resolveSeasonSelection(base({ availableSeasons: [{ year: 2026, hasData: true }] }))
    ).toEqual({ season: 2026 });
  });
});

describe('once a season is chosen, the picker owns it', () => {
  it('does not snap a past year back to the active one', () => {
    // Re-deciding on every render is what made choosing 2025 in the app
    // header bounce straight back to 2026.
    expect(resolveSeasonSelection(base({ selectedSeason: 2025 }))).toBeNull();
  });

  it('leaves the active season alone when it is the one selected', () => {
    expect(resolveSeasonSelection(base({ selectedSeason: 2026 }))).toBeNull();
  });
});

describe('a preseason with no races', () => {
  it('opens the most recent season that has data instead of an empty page', () => {
    const out = resolveSeasonSelection(
      base({
        availableSeasons: [
          { year: 2026, hasData: false },
          { year: 2025, hasData: true },
        ],
      })
    );
    expect(out).toEqual({ season: 2025, seasonMode: 'historical' });
  });

  it('respects an explicit choice to view the empty active season', () => {
    const out = resolveSeasonSelection(
      base({
        seasonModeExplicit: true,
        availableSeasons: [
          { year: 2026, hasData: false },
          { year: 2025, hasData: true },
        ],
      })
    );
    expect(out).toEqual({ season: 2026 });
  });

  it('does not thrash when the fallback is already selected', () => {
    const out = resolveSeasonSelection(
      base({
        selectedSeason: 2025,
        availableSeasons: [
          { year: 2026, hasData: false },
          { year: 2025, hasData: true },
        ],
      })
    );
    expect(out).toBeNull();
  });

  it('stays put when no season anywhere has data', () => {
    const out = resolveSeasonSelection(
      base({ availableSeasons: [{ year: 2026, hasData: false }] })
    );
    expect(out).toEqual({ season: 2026 });
  });
});

describe('historical mode', () => {
  it('opens a PAST season, not the active one', () => {
    const out = resolveSeasonSelection(base({ seasonMode: 'historical', seasonModeExplicit: true }));
    expect(out).toEqual({ season: 2025 });
  });

  it('prefers a past season that has data', () => {
    const out = resolveSeasonSelection(
      base({
        seasonMode: 'historical',
        seasonModeExplicit: true,
        availableSeasons: [
          { year: 2026, hasData: true },
          { year: 2025, hasData: false },
          { year: 2024, hasData: true },
        ],
      })
    );
    expect(out).toEqual({ season: 2024 });
  });
});

describe('waiting on data', () => {
  it('decides nothing before the active season is known', () => {
    expect(resolveSeasonSelection(base({ activeSeason: undefined }))).toBeNull();
  });

  it('decides nothing before the season list arrives', () => {
    expect(resolveSeasonSelection(base({ availableSeasons: [] }))).toBeNull();
  });
});
