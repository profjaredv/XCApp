// Which season Analytics should be looking at.
//
// This lived inside a useEffect, which meant it could only ever be tested
// by reading the source as text — and text tests do not notice when a
// branch that looked redundant was actually the only thing initializing
// the page. Deleting one such branch shipped a build where every link
// from the dashboard landed on "No team data found": nothing set a
// season, so every query downstream sat on undefined.
//
// As a pure function the cases are enumerable, so that specific failure is
// now a test rather than a screenshot.

export type SeasonMode = 'current' | 'historical';

export interface SeasonInput {
  /** The team's active season. Undefined until it loads. */
  activeSeason: number | undefined;
  /** What ?season= currently says. Undefined on a first visit. */
  selectedSeason: number | undefined;
  seasonMode: SeasonMode;
  /** Whether ?seasonMode= was explicitly set, vs defaulted. */
  seasonModeExplicit: boolean;
  availableSeasons: Array<{ year: number; hasData: boolean }>;
}

/** null = leave it alone. Otherwise, the params to write. */
export type SeasonDecision = { season: number; seasonMode?: SeasonMode } | null;

export function resolveSeasonSelection(input: SeasonInput): SeasonDecision {
  const { activeSeason, selectedSeason, seasonMode, seasonModeExplicit, availableSeasons } = input;

  if (activeSeason === undefined) return null;
  if (availableSeasons.length === 0) return null;

  // A fresh preseason nobody has navigated yet: the active season has no
  // races, but past seasons do. Landing on the empty one every visit is
  // technically correct and useless.
  const activeHasData = availableSeasons.find((s) => s.year === activeSeason)?.hasData ?? false;
  if (!seasonModeExplicit && !activeHasData && availableSeasons.some((s) => s.hasData)) {
    const fallback =
      availableSeasons.find((s) => s.year !== activeSeason && s.hasData)?.year ??
      availableSeasons.find((s) => s.hasData)?.year;
    if (fallback !== undefined && fallback !== selectedSeason) {
      return { season: fallback, seasonMode: 'historical' };
    }
    return null;
  }

  // Already chosen — the season picker owns it from here. Re-deciding on
  // every render is what made picking a past year snap straight back.
  if (selectedSeason !== undefined) return null;

  if (seasonMode === 'historical') {
    const past = availableSeasons.filter((s) => s.year !== activeSeason);
    const choice = past.find((s) => s.hasData)?.year ?? past[0]?.year ?? availableSeasons[0]?.year;
    return choice === undefined ? null : { season: choice };
  }

  return { season: activeSeason };
}
