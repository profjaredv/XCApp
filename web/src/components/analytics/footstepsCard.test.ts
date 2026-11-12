import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const card = read('components/analytics/FootstepsCard.tsx');
const page = read('pages/AthleteJourneyPage.tsx');

describe('Footsteps card', () => {
  it('sits on the athlete journey page, above the season timeline', () => {
    expect(page.indexOf('<FootstepsCard')).toBeGreaterThan(-1);
    expect(page.indexOf('<FootstepsCard')).toBeLessThan(page.indexOf('border-l-2'));
  });

  it('shows the label the server sent and never builds a name itself', () => {
    expect(card).toContain('m.label');
    expect(card).not.toMatch(/m\.name\b/);
  });

  it('always shows the range and the count beside a projected time', () => {
    expect(card).toContain('last.fastestFiveKSec');
    expect(card).toContain('last.slowestFiveKSec');
    expect(card).toContain('last.basedOn');
  });

  it('puts no time on it without a projection from the server', () => {
    expect(card).toContain('too few to project from');
  });

  it('keeps faster lower on the chart', () => {
    expect(card).not.toMatch(/<YAxis[^>]*\breversed\b/);
  });
});
