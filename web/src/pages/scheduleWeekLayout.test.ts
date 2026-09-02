import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The week view on a phone.
//
// Seven columns were pinned at min-w-[720px] inside a horizontal scroller,
// so on a 390px screen a coach saw two and a half days and had to swipe
// sideways for the rest. Below md the week now stacks into one row per
// day; the same DayCell renders both so a day can't drift into showing
// different things depending on screen width.

const SOURCE = fs.readFileSync(path.join(__dirname, 'SchedulePage.tsx'), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
  .join('\n');

const weekView = code.slice(
  code.indexOf("{viewMode === 'week' && ("),
  code.indexOf("{viewMode === 'agenda' && (")
);

describe('schedule week view', () => {
  it('does not force a fixed pixel width the phone has to scroll', () => {
    expect(weekView).not.toContain('min-w-[720px]');
    expect(weekView).not.toContain('overflow-x-auto');
  });

  it('stacks below md and keeps the seven-column grid above it', () => {
    expect(weekView).toContain('md:hidden');
    expect(weekView).toContain('hidden md:grid grid-cols-7');
  });

  it('renders both layouts through DayCell', () => {
    expect(weekView.match(/<DayCell/g) ?? []).toHaveLength(2);
    expect(weekView).toContain('stacked');
    expect(weekView).toContain('roomy');
  });

  it('gives the stacked row its own weekday label, since the header row is grid-only', () => {
    const dayCell = code.slice(code.indexOf('const DayCell'));
    expect(dayCell).toContain("weekday: 'short'");
  });
});
