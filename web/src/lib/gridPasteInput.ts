// One paste box (Boys or Girls) -> a payload, or the reason there isn't one.
// Plain text is the primary path and decides what is imported; clipboard HTML
// only adds Athletic.net ids (gridPasteMerge.ts). A grid's HTML pasted whole
// (the "Having trouble?" element copy) is read on its own.

import { mergeHtmlIds, payloadFromHtml } from './gridPasteMerge';
import { buildGridPayload, parseGridText, type GridGender, type GridPayload } from './gridTextParse';
import { looksLikeGridHtml, parseResultsGrid } from './resultsGridPaste';

export interface PasteBox {
  text: string;
  /** text/html from the paste event, if the clipboard carried any. */
  html: string;
}

export interface BoxRead {
  state: 'empty' | 'error' | 'needsInfo' | 'ok';
  payload: GridPayload | null;
  errors: string[];
  notes: string[];
  /** A one-line description of what was read, for under the box. */
  summary: string;
}

const LABEL: Record<GridGender, string> = { Men: 'Boys', Women: 'Girls' };

export function readBox(gender: GridGender, box: PasteBox, infoText = ''): BoxRead {
  const empty: BoxRead = { state: 'empty', payload: null, errors: [], notes: [], summary: '' };
  if (!box.text.trim()) return empty;
  const fail = (...errors: string[]): BoxRead => ({ state: 'error', payload: null, errors, notes: [], summary: '' });

  let payload: GridPayload | null = null;
  const notes: string[] = [];

  if (looksLikeGridHtml(box.text)) {
    // The grid's HTML pasted whole.
    const grid = parseResultsGrid(box.text);
    if (grid.errors.length) return fail(...grid.errors);
    if (grid.gender && grid.gender !== gender) {
      return fail(`That is the ${LABEL[grid.gender]} grid. Paste it in the ${LABEL[grid.gender]} box.`);
    }
    payload = payloadFromHtml({ ...grid, gender });
    if (!payload) return fail('Could not read that grid.');
    notes.push(...payload.notes);
  } else {
    const built = buildGridPayload(parseGridText(box.text), gender, infoText);
    if (built.needsMeetInfo) return { ...empty, state: 'needsInfo' };
    if (!built.payload) return fail(...built.errors);
    const merged = mergeHtmlIds(built.payload, box.html);
    payload = merged.payload;
    notes.push(...payload.notes);
  }

  const results = payload.athletes.reduce((n, a) => n + a.cells.length, 0);
  return {
    state: 'ok',
    payload,
    errors: [],
    notes,
    summary: `${LABEL[gender]}: ${payload.athletes.length} athletes, ${results} results across ${payload.meets.length} meets`,
  };
}

/** Applies the coach's choice among two times in one cell. */
export function applyPicks(payload: GridPayload, picks: Record<string, string>): GridPayload {
  return {
    ...payload,
    athletes: payload.athletes.map((a) => ({
      ...a,
      cells: a.cells.map((c) => {
        if (!c.alternatives) return c;
        const pick = picks[pickKey(a.key, c.meet, c.distance)];
        return pick && c.alternatives.includes(pick) ? { ...c, time: pick } : c;
      }),
    })),
  };
}

export const pickKey = (athleteKey: string, meet: number, distance: string) => `${athleteKey}|${meet}|${distance}`;
