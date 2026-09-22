import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The head coach's "Mile 3 pace" — (finish - mile 2) / 1.1 — is exactly
// the closing segment's own pace (lib/splitMath.js's segments(), already
// tested there for a 5K down to the 5:34/mi digit). The backend has
// always computed it; the entry grid only ever showed the closing
// segment's raw TIME next to a separate "Pace" column that is the WHOLE
// RACE's average, not this segment's — so the one number the coach
// actually wanted was never on screen.
//
// "Only for a 5K or longer, same for other distances" needs no extra
// gating here: markersForRace already returns no marker at all for a
// short race (1 mile: "splits do not apply"; see splitMath.test.js), so
// `closingSeg` is simply undefined and every cell below already falls
// back to '—'. This just makes sure the pace rides along whenever a
// closing segment DOES exist, at whatever distance.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('SplitsEntryPage.tsx'));

describe('closing-segment pace in the splits entry grid', () => {
  it('shows the closing segment\'s own pace, not the whole-race average, under its time', () => {
    const cell = page.slice(
      page.indexOf('{closingSeg ? (\n                        <>'),
      page.indexOf('{row.overallPaceSecPerMile != null ? `${formatSplitMMSS(row.overallPaceSecPerMile)}/mi` : \'—\'}\n                    </td>')
    );
    expect(cell).toContain('closingSeg.paceSecPerMile != null');
    expect(cell).toContain('{formatSplitMMSS(closingSeg.paceSecPerMile)}/mi');
  });

  it('falls back to an em dash when there is no closing segment at all — a race too short for one', () => {
    const start = page.indexOf('{closingSeg ? (\n                        <>');
    const cell = page.slice(start, page.indexOf('</td>', start));
    expect(cell).toContain("'—'");
  });

  it('shows the closing pace in the print view too, inline as "time (pace/mi)"', () => {
    const printCell = page.slice(page.indexOf('{closingSeg\n                              ?'), page.indexOf('{closingSeg\n                              ?') + 400);
    expect(printCell).toContain('closingSeg.paceSecPerMile != null');
    expect(printCell).toContain('/mi)`');
  });

  it('adds the closing pace as its own CSV column, distinct from the whole-race Pace column', () => {
    expect(page).toContain("'Final Pace'");
    const headerLine = page.slice(page.indexOf('const headers = ['), page.indexOf('];', page.indexOf('const headers = [')));
    expect(headerLine).toContain("'Final',");
    expect(headerLine).toContain("'Final Pace',");
    expect(headerLine).toContain("'Pace',");
  });

  it('CSV Final Pace is read off the closing segment, not the whole-race average', () => {
    expect(page).toContain("'Final Pace': closingSeg?.paceSecPerMile != null ? `${formatSplitMMSS(closingSeg.paceSecPerMile)}/mi` : ''");
  });
});
