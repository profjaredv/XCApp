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
    expect(page).toContain('<Select value={String(safeRaceIndex)}');
    expect(page).toContain('aria-label="Previous meet"');
    expect(page).toContain('aria-label="Next meet"');
  });

  it('disables the arrows at each end rather than wrapping around', () => {
    expect(page).toContain('disabled={safeRaceIndex === 0}');
    expect(page).toContain('disabled={safeRaceIndex >= gridData.races.length - 1}');
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

  it('can still sort by the shown meet on a phone', () => {
    expect(page).toContain("onClick={() => handleSort('time', safeRaceIndex)}");
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
