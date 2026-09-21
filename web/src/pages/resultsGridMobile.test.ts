import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Results Grid on a phone. A ten-meet grid cannot be read sideways on
// a 390px screen, and the page opened with a bare <Card> while every other
// screen opens with PageHeader — which is why it read as something nested
// inside another view.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/ResultsGridPage.tsx'));

describe('results grid is a page, not a nested card', () => {
  it('opens with PageHeader like every other screen', () => {
    expect(page).toContain('<PageHeader');
    expect(page).toContain('title="Results Grid"');
    expect(page).not.toContain('<CardTitle>Results Grid</CardTitle>');
  });

  it('keeps that header in the loading, error and empty states too', () => {
    expect(page).toContain('const header = embedded ? null : (');
    expect(page).not.toContain("return <div>Loading...</div>");
    expect((page.match(/\{header\}/g) ?? []).length).toBe(3);
  });

  it('suppresses its own header when embedded in the Season tab, which has one already', () => {
    expect(page).toContain('embedded = false');
    expect(page).toContain('{!embedded && (');
  });

  it('takes a click signal DOWN rather than handing a function UP', () => {
    // Handing handleExportCsv up into the parent's state stored a new
    // function identity on every render — setState per render, React #185,
    // a white screen on the live site. A number only changes on a click.
    expect(page).toContain('exportSignal');
    expect(page).not.toContain('onExportReady');
    expect(page).toContain('}, [exportSignal]);');
  });

  it('reads the handler through a ref, so the effect need not depend on it', () => {
    // handleExportCsv is rebuilt every render; depending on it here would
    // fire the download on every render instead of on every click.
    expect(page).toContain('exportRef.current = handleExportCsv');
    expect(page).toContain('if (exportSignal > 0) exportRef.current()');
  });
});

describe('filters', () => {
  it('drops the third season picker — the app header already owns that state', () => {
    // It wrote setSelectedYear on the same SeasonContext as Layout's.
    const grid = page.slice(page.indexOf('const safeRaceIndex'));
    expect(grid).not.toContain('<select');
    expect(grid).not.toContain("Season:");
  });

  it('keeps a season choice ONLY in the empty state, where it is the way out', () => {
    const empty = page.slice(page.indexOf('No results for this season yet'), page.indexOf('const safeRaceIndex'));
    expect(empty).toContain('setSelectedSeason(season)');
  });

  it('uses short grade labels and no "Filter by …:" prose, so the set fits a phone', () => {
    expect(page).toContain('{gradeLabelShort(grade)}');
    expect(page).not.toContain('Filter by Grade:');
    expect(page).not.toContain('Filter by Gender:');
  });

  it('shows one chip per gender, not one per spelling stored in the data', () => {
    // 'M' and 'Men' both live in real rows, which produced Boys, Girls AND
    // Men as three separate chips — and filtering to one silently dropped
    // the athletes stored under the other.
    expect(page).toContain('const key = normalizeGender(athlete.gender)');
    expect(page).toContain("return ['M', 'F'].filter((g) => genders.has(g))");
  });

  it('filters on the normalized key, so no athlete is dropped by spelling', () => {
    expect(page).toContain('const genderKey = normalizeGender(athlete.gender)');
    expect(page).toContain('genderMatch = selectedGenders.has(genderKey)');
  });

  it('labels them Male and Female through one shared helper', () => {
    expect(page).toContain('{genderLabel(gender)}');
    expect(page).not.toContain("'Boys' : gender === 'F' ? 'Girls'");
  });

  it('drops the one-button "Sort by:" row — the table header already sorts by name', () => {
    expect(page).not.toContain('Sort by:');
    expect(page).toContain("onClick={() => handleSort('name')}");
  });

  it('shares one chip style across the filters rather than three hand-rolled ones', () => {
    expect(page).toContain('const chip = (active: boolean) =>');
  });

  it('hides the gender filter when a team only has one', () => {
    expect(page).toContain('availableGenders.length > 1 &&');
  });
});

describe('phone layout', () => {
  it('shows one meet at a time instead of a sideways scroll', () => {
    expect(page).toContain('<div className="space-y-3 md:hidden">');
  });

  it('picks the meet with a control that survives a full season of them', () => {
    // A pill per meet was fine for three and unusable by ten — a dozen
    // meets is four rows of pills before a single time is on screen.
    expect(page).not.toContain('<SegmentedPills');
    expect(page).toContain('<Select\n              value={String(safeMeetIndex)}');
    expect(page).toContain('aria-label="Previous meet"');
    expect(page).toContain('aria-label="Next meet"');
  });

  it('lists MEETS, with heats underneath — not the same meet twice', () => {
    // The scraper names every race after its meet, so two distances at one
    // meet arrive as two identically-named columns.
    expect(page).toContain('groupColumnsByMeet(gridData.races)');
    expect(page).toContain('{meetGroups.map((group, index) => (');
  });

  it('offers a heat toggle ONLY when a meet ran more than one distance', () => {
    expect(page).toContain('{activeMeet?.hasHeats && (');
    expect(page).toContain('{distanceLabel(column.distanceMeters)}');
  });

  it('selecting a meet lands on its first heat rather than a stale column', () => {
    expect(page).toContain('setMobileRaceIndex(meetGroups[next].columns[0].index)');
  });

  it('disables the arrows at each end rather than wrapping around', () => {
    expect(page).toContain('disabled={safeMeetIndex === 0}');
    expect(page).toContain('disabled={safeMeetIndex >= meetGroups.length - 1}');
  });

  it('clamps the selected meet so a season with fewer races cannot index off the end', () => {
    expect(page).toContain('const safeRaceIndex = Math.min(mobileRaceIndex, Math.max(0, gridData.races.length - 1))');
  });

  it('keeps the full table for md and up', () => {
    expect(page).toContain('<Card className="hidden md:block">');
    expect(page).toContain('sticky left-0 z-10 min-w-[12rem] cursor-pointer bg-card');
  });

  it('truncates long meet names in the header rather than stretching the column', () => {
    expect(page).toContain('max-w-[10rem] truncate');
  });

  it('can still sort by the shown heat on a phone', () => {
    expect(page).toContain("onClick={() => handleSort('time', activeColumnIndex)}");
  });
});

describe('housekeeping', () => {
  it('no longer logs every athlete\'s results to the console on each render', () => {
    expect(page).not.toContain('console.log');
  });
});

describe('export lives with the other data actions', () => {
  const analytics = code(read('pages/AnalyticsPage.tsx'));
  const header = code(read('components/analytics/AnalyticsHeader.tsx'));

  it('the Season tab embeds the grid and drives its export by signal', () => {
    expect(analytics).toContain('<ResultsGridPage embedded exportSignal={gridExportSignal} />');
    expect(analytics).not.toContain('setGridExport(');
  });

  it('the export shows up in the Data actions menu, only on that tab', () => {
    expect(analytics).toContain("activeTab === 'resultsGrid' ?");
    expect(analytics).toContain('setGridExportSignal((n) => n + 1)');
    expect(header).toContain('{extraActions}');
  });
});

describe('sized for a field, not a desk', () => {
  it('gives every filter chip a 44px target and readable type', () => {
    // They were 10px labels in a 24px box — under every mobile platform's
    // minimum target, and hard to read outdoors.
    expect(page).toContain('inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium');
    expect(page).not.toContain('px-3 py-1 text-xs font-medium');
  });

  it('sizes the athlete rows for a phone held at arm\'s length', () => {
    expect(page).toContain('truncate text-lg font-semibold leading-tight');
    expect(page).toContain('shrink-0 font-mono text-lg font-medium tabular-nums');
    expect(page).toContain('text-sm text-muted-foreground">{gradeLabelShort(athlete.grade)}');
  });
});

describe('sort is reachable again', () => {
  it('offers both fields on a phone, where there is no table header to tap', () => {
    const mobile = page.slice(page.indexOf('md:hidden'), page.indexOf('hidden md:block'));
    expect(mobile).toContain("onClick={() => handleSort('name')}");
    expect(mobile).toContain("onClick={() => handleSort('time', activeColumnIndex)}");
  });

  it('puts it ABOVE the list — under a hundred names it may as well not exist', () => {
    const mobile = page.slice(page.indexOf('md:hidden'), page.indexOf('hidden md:block'));
    expect(mobile.indexOf("handleSort('name')")).toBeLessThan(mobile.indexOf('processedAthletes.map'));
  });

  it('marks the active field, so the order is not a mystery', () => {
    expect(page).toContain("className={chip(sortField === 'name')}");
    expect(page).toContain("chip(sortField === 'time' && sortRaceIndex === activeColumnIndex)");
  });
});

describe('season mode is gone', () => {
  const analytics = code(read('pages/AnalyticsPage.tsx'));
  const header = code(read('components/analytics/AnalyticsHeader.tsx'));

  it('no longer renders a Current/Past Season toggle', () => {
    expect(header).not.toContain('SeasonModeSelector');
    expect(header).not.toContain('seasonMode');
  });

  it('stops pinning the season, which fought the app header picker', () => {
    // The 'current' branch reset selectedSeason to the active season on
    // every render, so picking a past year in the header snapped back.
    expect(analytics).not.toContain("if (seasonMode === 'current') {");
    expect(analytics).not.toContain('handleSeasonModeChange');
  });

  it('keeps the preseason fallback, which is about data rather than the toggle', () => {
    // The decision moved into lib/seasonSelection.ts, where the preseason
    // case is an enumerated test rather than a branch read as text.
    expect(analytics).toContain('resolveSeasonSelection({');
    expect(analytics).toContain('seasonModeExplicit: seasonModeParam !== undefined');
  });

  it('always resolves a season on first load — no season means an empty page', () => {
    expect(analytics).toContain('if (!decision) return;');
    expect(analytics).toContain('setSelectedSeasonParam(decision.season)');
  });

  it('right-aligns the actions instead of centring them mid-page', () => {
    expect(header).toContain('relative mb-4 flex justify-end');
    expect(header).not.toContain('sm:justify-end items-center');
  });
});
