import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The course-adjusted progression card has to live where a coach actually
// looks at race-by-race times. TeamAthleteProfilePage renders
// AthleteDetailModal as a `fixed inset-0 z-50` overlay across its own
// body, so anything placed in the page body is covered whenever metrics
// have been calculated — which is the normal case. The card therefore
// sits inside the modal's All Races tab; the page-body copy stays only
// because it is the one thing visible in the "metrics not calculated yet"
// state, where no modal renders at all.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const modal = code(read('components/analytics/AthleteDetailModal.tsx'));
const page = code(read('pages/TeamAthleteProfilePage.tsx'));

describe('course-adjusted progression placement', () => {
  it('renders inside the modal that actually covers the screen, not only in the page body behind it', () => {
    expect(modal).toContain('<CourseAdjustedProgressionCard athleteId={selectedAthlete.id} />');
  });

  it('sits in the All Races tab, above the raw-time chart it reframes', () => {
    const racesTab = modal.slice(
      modal.indexOf('<TabsContent value="races">'),
      modal.indexOf('<TabsContent value="splits">')
    );
    expect(racesTab).toContain('CourseAdjustedProgressionCard');
    expect(racesTab.indexOf('CourseAdjustedProgressionCard')).toBeLessThan(
      racesTab.indexOf('Race Performance Over Time')
    );
  });

  it('keeps the page-body copy for the pre-calculation state, where the modal never renders', () => {
    expect(page).toContain('<CourseAdjustedProgressionCard athleteId={athleteId} season={selectedSeason} />');
  });

  it('is guarded on an athlete id in both homes rather than fetching for undefined', () => {
    expect(modal).toContain('selectedAthlete?.id && (');
    expect(page).toContain('{athleteId && (');
  });
});
