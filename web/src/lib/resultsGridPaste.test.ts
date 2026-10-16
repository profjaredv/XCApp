// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { gridsToCsv, looksLikeGridHtml, parseResultsGrid } from './resultsGridPaste';

// Synthetic grid (made-up names) with the same structure as Athletic.net's
// page (shaped like the <shared-results-grid> element a coach copies).
import html from './fixtures/results-grid-element.html?raw';

describe('parseResultsGrid', () => {
  const g = parseResultsGrid(html);
  it('reads year, gender, meets and the distance key', () => {
    expect(g.errors).toEqual([]);
    expect(g.year).toBe(2026);
    expect(g.gender).toBe('Men');
    expect(g.meets.map((m) => m.id)).toEqual(['285001', '285002', '285003']);
    expect(g.meets[0].id).toMatch(/^\d+$/);
  });
  it('carries athlete ids and distances from the links and the legend', () => {
    expect(g.rows.length).toBeGreaterThan(0);
    expect(g.rows.every((r) => /\/athlete\/\d+\//.test(r.athleteUrl))).toBe(true);
    expect(g.rows.some((r) => r.distance === 'Unknown')).toBe(false);
    expect(g.rows.find((r) => r.athleteName === 'Alex Runner')).toMatchObject({ grade: '11', distance: '1 Miles', time: '6:39.0' });
    expect(g.teamId).toBe('9999');
  });
  it('writes the season CSV the import route takes', () => {
    const csv = gridsToCsv([g]);
    expect(csv.split('\n')[0]).toBe('"Race Name","Athlete Name","Grade","Gender","Time","Race Date","Distance","Source URL","Athletic Meet ID","Athletic Athlete ID"');
    expect(csv).toMatch(/"Sep 8, 2026"/);
    expect(csv).toContain('/athlete/9001/cross-country');
  });
  it('refuses a paste with no meet list or no distance key', () => {
    const noMeets = html.replace(/class="[^"]*meet-list-table[^"]*"/g, 'class="x"');
    expect(parseResultsGrid(noMeets).errors.join(' ')).toMatch(/meet list/);
    const noLegend = html.replace(/<sub[^>]*>[\s\S]*?<\/sub>/g, '');
    expect(parseResultsGrid(noLegend).errors.join(' ')).toMatch(/no distance/);
  });
  it('keeps the faster of two attempts in one cell, and skips DNS', () => {
    expect(g.notes.join(' ')).toMatch(/faster time was kept/);
    expect(g.notes.join(' ')).toMatch(/DNS\/DNF/);
    const blake = g.rows.filter((r) => r.athleteName === 'Blake Stride');
    expect(blake.map((r) => r.time)).toEqual(['6:07.0']);
  });
  it('tells grid html from csv', () => {
    expect(looksLikeGridHtml(html)).toBe(true);
    expect(looksLikeGridHtml('"Race Name","Athlete Name"\n"a","b"')).toBe(false);
  });
});
