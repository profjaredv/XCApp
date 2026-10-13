import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// docs/leadpack-new-ui-trial.md §2 — the shared fixes that are about what a
// page says rather than about logic with its own unit test (F2 and F5
// have those: lib/resultsGridFilters.test.ts, lib/fiveK.test.ts).

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('F1: no meet entry status for athletes', () => {
  it('My Progress, Today and the athlete Meets list never claim an entry status', () => {
    for (const file of ['pages/MyProgressPage.tsx', 'pages/TodayPage.tsx', 'pages/MeetsPage.tsx']) {
      const src = read(file);
      expect(src, file).not.toMatch(/You're (not )?entered/);
      expect(src, file).not.toContain('entryStatusLabel(');
    }
  });

  it('keeps the prediction card on My Progress', () => {
    expect(read('pages/MyProgressPage.tsx')).toContain('<RacePredictionCard athleteId={linkedAthlete.id} />');
  });
});

describe('F3: Data Management step labels', () => {
  it('each step card is headed with its own tab number', () => {
    expect(read('components/data-management/ImportDataPanel.tsx')).toContain('Step 1: Import Season Data');
    expect(read('components/data-management/EnhancedCalculateMetricsPanel.tsx')).toContain('Step 2: Calculate Metrics');
  });

  it('does not override the tab row\'s below-md `hidden` with a bare grid class', () => {
    const page = read('pages/DataManagementPage.tsx');
    expect(page).toContain('className="md:grid w-full md:grid-cols-2"');
  });
});
