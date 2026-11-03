// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import html from './fixtures/grid-boys.html?raw';
import text from './fixtures/grid-boys.txt?raw';
import { mergeHtmlIds, payloadFromHtml } from './gridPasteMerge';
import { buildGridPayload, parseGridText } from './gridTextParse';
import { parseResultsGrid } from './resultsGridPaste';

const textPayload = buildGridPayload(parseGridText(text), 'Men').payload!;
const finishRows = (p: { athletes: Array<{ name: string; cells: Array<{ meet: number; distance: string; time: string | null; status: string }> }> }) =>
  p.athletes
    .flatMap((a) => a.cells.filter((c) => c.status === 'FINISHED').map((c) => `${a.name}|${c.meet}|${c.distance}|${c.time}`))
    .sort();

describe('HTML + plain text', () => {
  it('an HTML paste with ids gives the same finishing rows as the plain text, plus the ids', () => {
    const merged = mergeHtmlIds(textPayload, html);
    expect(merged.usedHtml).toBe(true);
    expect(merged.mismatch).toBeNull();
    expect(merged.payload.athletes.every((a) => /\/athlete\/\d+\/cross-country$/.test(a.athleticAthleteId ?? ''))).toBe(true);
    expect(merged.payload.meets.every((m) => /^\d+$/.test(m.athleticMeetId ?? ''))).toBe(true);
    // Rows are untouched by the merge.
    expect(finishRows(merged.payload)).toEqual(finishRows(textPayload));
    // And the HTML read on its own agrees with the text read.
    const fromHtml = payloadFromHtml(parseResultsGrid(html))!;
    expect(finishRows(fromHtml)).toEqual(finishRows(textPayload));
    expect(fromHtml.athletes).toHaveLength(71);
  });

  it('uses the plain text and logs when the HTML disagrees on athlete or meet count', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fewer = html.replace(/<tr class="y\d+">(?:(?!<\/tr>)[\s\S])*<\/tr>/, '');
    const merged = mergeHtmlIds(textPayload, fewer);
    expect(merged.usedHtml).toBe(false);
    expect(merged.mismatch).toMatch(/70 athletes/);
    expect(merged.payload).toBe(textPayload);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores clipboard HTML that is not the grid', () => {
    expect(mergeHtmlIds(textPayload, '<p>hello</p>').usedHtml).toBe(false);
    expect(mergeHtmlIds(textPayload, null).payload).toBe(textPayload);
  });
});
