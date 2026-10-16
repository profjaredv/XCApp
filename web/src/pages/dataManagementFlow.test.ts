import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Clearing a season used to be STEP 1 of Data Management, and a second
// button on Analytics. It is not a normal step: a re-import already
// rebuilds the season, and clearing first is strictly worse — the import
// preserves each race's meet link by matching against the rows still
// present, so clearing beforehand orphans every race from its meet.
// Deleting a Race also cascades to field results, splits, entrants and
// race reflections, none of which a re-import restores.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const dataMgmt = code(read('pages/DataManagementPage.tsx'));
const header = code(read('components/analytics/AnalyticsHeader.tsx'));
const analytics = code(read('pages/AnalyticsPage.tsx'));
const settings = code(read('pages/SettingsPage.tsx'));

describe('the flow is import then calculate', () => {
  it('has two steps, not three', () => {
    expect(dataMgmt).toContain('Step 1: Import');
    expect(dataMgmt).toContain('Step 2: Calculate Metrics');
    expect(dataMgmt).not.toContain('Step 1: Clear Data');
    // md: prefixed so it doesn't override the tab row's own below-md
    // `hidden` (F3) — two columns from md up, the dropdown below.
    expect(dataMgmt).toContain('md:grid w-full md:grid-cols-2');
  });

  it('drops the CLEAR step from the enum and the panel entirely', () => {
    expect(dataMgmt).not.toContain('CLEAR');
    expect(dataMgmt).not.toContain('ClearDataPanel');
  });

  it('opens on Import rather than a step that no longer exists', () => {
    expect(dataMgmt).toContain('useState<DataManagementStep>(DataManagementStep.IMPORT)');
  });
});

describe('clearing survives in exactly one place', () => {
  it('is gone from the Analytics data actions', () => {
    expect(header).not.toContain('Clear Team Data');
    expect(header).not.toContain('handleClearTeamData');
    expect(analytics).not.toContain('handleClearTeamData');
  });

  it('still exists in Settings > Danger zone, behind a confirmation', () => {
    expect(settings).toContain('title="Danger zone"');
    expect(settings).toContain('Clear All Team Data');
    expect(settings).toContain('<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>');
  });
});

describe('the server-side Athletic.net import is gone', () => {
  it('the Data Management page offers Update results, not a scrape button', () => {
    expect(dataMgmt).toContain('UpdateResultsPanel');
    expect(dataMgmt).not.toContain('ImportDataPanel');
  });

  it('nothing in the client calls the scraper endpoints', () => {
    const hooks = code(read('hooks/useDataManagement.ts'));
    const service = code(read('api/dataManagementService.ts'));
    const roster = code(read('api/rosterService.ts'));
    expect(hooks).not.toContain('useImportData');
    expect(service).not.toContain('/teams/scrape');
    expect(roster).not.toContain('/teams/scrape-roster');
  });
});
