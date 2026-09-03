import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Story mode and the numbers under it.
//
// The property worth holding here is where the reading comes from: the
// sentences are computed on the server from the same figures the charts
// draw, so the client renders them and never composes its own.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const story = code(read('components/analytics/ProgramStory.tsx'));
const overview = code(read('components/analytics/ProgramOverviewSection.tsx'));
const page = code(read('pages/BandTrendsPage.tsx'));

describe('story mode', () => {
  it('renders the server’s sentences rather than composing its own', () => {
    expect(story).toContain('beat.headline');
    expect(story).toContain('beat.detail');
    // No thresholds, comparisons or prose assembly on the client — one set
    // of rules, in one place, testable without a browser.
    expect(story).not.toMatch(/faster than|slower than|% returned/);
  });

  it('shows the working for every claim', () => {
    expect(story).toContain('Show the numbers');
    expect(story).toContain('beat.evidence');
  });

  it('puts what the app cannot say last, and folded away', () => {
    expect(story).toContain("b.kind === 'gap'");
    expect(story).toContain("can't tell you yet");
  });

  it('leads the page, above the charts it is reading', () => {
    const storyAt = page.indexOf('<ProgramStory');
    const chartsAt = page.indexOf('<ProgramOverviewSection');
    expect(storyAt).toBeGreaterThan(-1);
    expect(storyAt).toBeLessThan(chartsAt);
  });
});

describe('program numbers', () => {
  it('uses live race miles, not the cached metric that needs a manual run', () => {
    expect(overview).toContain('miles: s.raceMiles');
    expect(overview).not.toContain('miles: s.milesLogged');
  });

  it('reports miles per athlete beside the total', () => {
    // A longer schedule logs more miles without anyone running further.
    expect(overview).toContain('perAthlete: s.milesPerAthlete');
    expect(overview).toContain('meets: s.meets');
  });

  it('charts returning vs new, and says nothing for the first season on file', () => {
    expect(overview).toContain('s.churn?.returning != null');
    expect(overview).toContain('nothing to have returned from');
  });

  it('plots pace and pack spread with faster at the top', () => {
    // Lower is faster; an un-reversed axis draws improvement as a decline.
    expect(overview.match(/<YAxis reversed/g) ?? []).toHaveLength(2);
  });

  it('carries n on every pace point', () => {
    expect(overview).toContain('menN');
    expect(overview).toContain('womenN');
  });

  it('says when its own retention cohort may be mis-dated', () => {
    expect(overview).toContain('attrition.leftCensored');
    expect(overview).toContain('earliest');
  });
});
