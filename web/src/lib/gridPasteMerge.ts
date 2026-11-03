// Joins the plain-text read of a Results Grid paste with the HTML the same
// copy sometimes carries. The text decides what is imported; the HTML only
// adds Athletic.net ids (athlete and meet) when it agrees with the text.

import { parseResultsGrid, type ParsedGrid } from './resultsGridPaste';
import type { GridPayload, PasteAthlete, PasteMeet } from './gridTextParse';

const normName = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const normDate = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface MergeResult {
  payload: GridPayload;
  /** Set when the HTML disagreed with the text and was ignored. */
  mismatch: string | null;
  /** Ids were added from the HTML. */
  usedHtml: boolean;
}

/** Adds ids from `html` to a text-built payload, or leaves it alone (and says why) if they disagree. */
export function mergeHtmlIds(payload: GridPayload, html: string | null | undefined): MergeResult {
  if (!html) return { payload, mismatch: null, usedHtml: false };
  let grid: ParsedGrid;
  try {
    grid = parseResultsGrid(html);
  } catch {
    return { payload, mismatch: null, usedHtml: false };
  }
  if (grid.errors.length) return { payload, mismatch: null, usedHtml: false };

  const datesMatch = grid.meets.length === payload.meets.length && grid.meets.every((m, i) => normDate(m.date) === normDate(payload.meets[i].date));
  if (grid.athletes.length !== payload.athletes.length || !datesMatch) {
    const mismatch = `HTML has ${grid.athletes.length} athletes / ${grid.meets.length} meets, text has ${payload.athletes.length} / ${payload.meets.length}`;
    console.warn(`[results-paste] HTML and plain text disagree (${mismatch}); using the plain text.`);
    return { payload, mismatch, usedHtml: false };
  }

  const urlByName = new Map<string, string>();
  for (const a of grid.athletes) urlByName.set(normName(a.name), a.url);
  const meets: PasteMeet[] = payload.meets.map((m, i) => ({ ...m, athleticMeetId: grid.meets[i].id || undefined }));
  const athletes: PasteAthlete[] = payload.athletes.map((a) => {
    const url = urlByName.get(normName(a.name));
    return url ? { ...a, athleticAthleteId: url } : a;
  });
  return { payload: { ...payload, meets, athletes }, mismatch: null, usedHtml: true };
}

/** Builds a payload from the grid's HTML alone (the "Having trouble?" element paste). */
export function payloadFromHtml(grid: ParsedGrid): GridPayload | null {
  if (!grid.gender || grid.errors.length) return null;
  const meets: PasteMeet[] = grid.meets.map((m) => ({ date: normDate(m.date), name: m.name, athleticMeetId: m.id || undefined }));
  const byUrl = new Map<string, PasteAthlete>();
  grid.athletes.forEach((a, i) => {
    if (!byUrl.has(a.url)) byUrl.set(a.url, { key: `${grid.gender}:${i}`, name: a.name, grade: null, athleticAthleteId: a.url, cells: [] });
  });
  for (const r of grid.rows) {
    const a = byUrl.get(r.athleteUrl);
    if (!a) continue;
    if (a.grade == null && /^\d+$/.test(r.grade)) a.grade = Number(r.grade);
    a.cells.push({ meet: grid.meets.indexOf(r.meet), distance: r.distance, time: r.time, status: 'FINISHED' });
  }
  return { gender: grid.gender, meets, athletes: [...byUrl.values()], source: 'html', notes: grid.notes };
}
