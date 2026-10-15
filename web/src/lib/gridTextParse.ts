// Plain-text reader for Athletic.net's team Results Grid, as copied with
// Ctrl+A, Ctrl+C on the page (no DevTools, no HTML needed).
//
// What the clipboard text looks like (verified against a real Boys paste):
//
//   Gr<TAB>Age<TAB><TAB>Athlete<TAB>Sep 8<TAB>Sep 11 ...   header; dates start at column 5
//   11<TAB>17<TAB>                                          grade, optional age
//   GB                                                      avatar initials (1-3 letters, "Lv" too)
//   Graeme Branine<TAB>5:17.0 1<TAB>8:26.6 2<TAB> <TAB>...  name, then one cell per date
//   Race Distances:1 1 Miles |2 1.5 Miles |...              the distance key
//   (Useful for copying to Excel)
//   Meet List
//   Sep 8
//   Reed Park Time Trial ...
//
// A cell is "time code" (the code is the distance's number in the key),
// "DNS 4", or a blank. A second attempt at the same meet wraps onto its own
// line INSIDE the cell, and the rest of that athlete's row carries on from
// the wrapped line, so a newline never starts a new cell, only a tab does.
//
// Nothing here touches the network or the DOM.

export type GridStatus = 'FINISHED' | 'DNS' | 'DNF' | 'DQ';
export type GridGender = 'Men' | 'Women';

export interface RawEntry {
  /** null for DNS/DNF/DQ. */
  time: string | null;
  status: GridStatus;
  /** Distance number in the key; '' when the paste has no subscripts. */
  code: string;
}

export interface TextAthlete {
  name: string;
  grade: number | null;
  age: number | null;
  initials: string;
  /** One list of entries per date; empty list = no result. Length may be short (padded by the caller). */
  cells: RawEntry[][];
  /** Cell text that did not read as a result (a stray token). */
  junk: boolean;
}

export interface MeetInfo {
  /** Distance key: code -> "1.5 Miles". null when the paste did not include it. */
  legend: Record<string, string> | null;
  /** Meet list in column order. null when the paste did not include it. */
  meets: Array<{ date: string; name: string }> | null;
}

export interface TextGrid extends MeetInfo {
  dates: string[];
  athletes: TextAthlete[];
  errors: string[];
}

// ---- payload sent to the server -------------------------------------------

export interface PasteMeet {
  date: string; // "Sep 8"
  name: string;
  athleticMeetId?: string;
}

export interface PasteCell {
  meet: number; // index into meets
  distance: string; // "5000 Meters" (the key's own wording)
  time: string | null;
  status: GridStatus;
  /** Set when the cell held two times at this distance; `time` is the pick. */
  alternatives?: string[];
}

export interface PasteAthlete {
  key: string;
  name: string;
  grade: number | null;
  athleticAthleteId?: string;
  cells: PasteCell[];
}

export interface GridPayload {
  gender: GridGender;
  meets: PasteMeet[];
  athletes: PasteAthlete[];
  source: 'text' | 'html';
  notes: string[];
}

// ---- reading -----------------------------------------------------------------

const GRADE_LINE = /^\s*(\d{1,2})\t(\d{0,2})\t?\s*$/;
const INITIALS_LINE = /^[A-Za-z]{1,3}$/;
const DATE_TOKEN = /^[A-Z][a-z]{2,8}\.?\s+\d{1,2}$/;
const ENTRY = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?|DNS|DNF|DQ)\s*(?:(?:PB|SB|SR|PR)\s*)?(?:(\d{1,2})(?![\d:.]))?/g;
const BADGE = /\b(?:PB|SB|SR|PR)\b/g;
const TABLE_END = /^\s*(Race Distances|\(Useful for copying|Hide Subscripts|Meet List|Key\s*$)/i;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Reads the distance key and the meet list from any text that contains them. */
export function parseMeetInfo(text: string): MeetInfo {
  const flat = text.replace(/\r\n?/g, '\n');
  let legend: Record<string, string> | null = null;
  const lm = flat.match(/Race Distances:?\s*([\s\S]*?)(?=\(Useful|Hide Subscripts|Meet List|\n\s*\n|$)/i);
  if (lm) {
    const found: Record<string, string> = {};
    for (const part of norm(lm[1]).split('|')) {
      const m = part.trim().match(/^(\d{1,2})\s+(.+)$/);
      if (m) found[m[1]] = m[2].trim();
    }
    if (Object.keys(found).length) legend = found;
  }

  let meets: MeetInfo['meets'] = null;
  const mi = flat.search(/Meet List/i);
  if (mi >= 0) {
    const tokens: string[] = [];
    for (const line of flat.slice(mi).split('\n').slice(1)) {
      if (/^\s*Key\s*$/i.test(line)) break;
      for (const t of line.split('\t')) {
        const v = norm(t);
        if (v) tokens.push(v);
      }
    }
    const found: Array<{ date: string; name: string }> = [];
    for (let i = 0; i < tokens.length; i++) {
      if (DATE_TOKEN.test(tokens[i]) && i + 1 < tokens.length) {
        found.push({ date: tokens[i], name: tokens[i + 1] });
        i++;
      }
    }
    if (found.length) meets = found;
  }
  return { legend, meets };
}

function parseCell(raw: string): { entries: RawEntry[]; junk: boolean } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { entries: [], junk: false };
  const entries: RawEntry[] = [];
  for (const m of text.matchAll(ENTRY)) {
    const t = m[1];
    const isTime = /^\d/.test(t);
    entries.push({ time: isTime ? t : null, status: isTime ? 'FINISHED' : (t as GridStatus), code: m[2] ?? '' });
  }
  const rest = text.replace(ENTRY, '').replace(BADGE, '').replace(/\s+/g, '');
  return { entries, junk: rest.length > 0 || entries.length === 0 };
}

export function parseGridText(text: string): TextGrid {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: TextGrid = { dates: [], athletes: [], errors: [], legend: null, meets: null };

  const headerAt = lines.findIndex((l) => /^\s*Gr\t/.test(l) && /Athlete/.test(l));
  if (headerAt < 0) {
    out.errors.push('That does not look like the Results Grid. On the grid, press Ctrl+A (⌘A), then Ctrl+C (⌘C), and paste here.');
    return out;
  }
  const head = lines[headerAt].split('\t').map((c) => c.trim());
  out.dates = head.slice(head.indexOf('Athlete') + 1).filter(Boolean);

  type Block = { grade: number | null; age: number | null; initials: string; name: string | null; cellText: string };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let tableEnd = lines.length;
  for (let i = headerAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (TABLE_END.test(line)) {
      tableEnd = i;
      break;
    }
    const g = line.match(GRADE_LINE);
    if (g && (!cur || cur.name !== null)) {
      cur = { grade: Number(g[1]), age: g[2] ? Number(g[2]) : null, initials: '', name: null, cellText: '' };
      blocks.push(cur);
      continue;
    }
    if (!cur || line === '') continue;
    if (cur.name === null) {
      if (!cur.initials && INITIALS_LINE.test(line.trim())) {
        cur.initials = line.trim();
        continue;
      }
      const tab = line.indexOf('\t');
      cur.name = norm(tab < 0 ? line : line.slice(0, tab));
      cur.cellText = tab < 0 ? '' : line.slice(tab + 1);
    } else {
      // A wrapped line: it continues the cell that was open, never starts a new one.
      cur.cellText += `\n${line}`;
    }
  }

  for (const b of blocks) {
    if (b.name === null) continue;
    const cells: RawEntry[][] = [];
    let junk = false;
    for (const raw of b.cellText.split('\t')) {
      const c = parseCell(raw);
      cells.push(c.entries);
      if (c.junk) junk = true;
    }
    out.athletes.push({ name: b.name, grade: b.grade, age: b.age, initials: b.initials, cells, junk });
  }

  const info = parseMeetInfo(lines.slice(tableEnd).join('\n'));
  out.legend = info.legend;
  out.meets = info.meets;
  if (out.athletes.length === 0) out.errors.push('No athletes were found in what was pasted. Copy the whole page again.');
  return out;
}

// ---- validation and the server payload --------------------------------------------

const toSeconds = (t: string) => {
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

export interface BuildResult {
  payload: GridPayload | null;
  errors: string[];
  /** The paste has no meet list or distance key: show the fallback box. */
  needsMeetInfo: boolean;
}

/**
 * Turns a parsed paste (plus the optional fallback text with the meet list
 * and key) into the payload the server plans from. Every check in the spec's
 * validation table lives here; nothing is saved by a failing paste.
 */
export function buildGridPayload(grid: TextGrid, gender: GridGender, fallbackText = ''): BuildResult {
  const fail = (...errors: string[]): BuildResult => ({ payload: null, errors, needsMeetInfo: false });
  if (grid.errors.length) return fail(...grid.errors);

  const extra = fallbackText.trim() ? parseMeetInfo(fallbackText) : { legend: null, meets: null };
  const legend = grid.legend ?? extra.legend;
  const meetList = grid.meets ?? extra.meets;

  // Subscripts off: times with no distance codes anywhere.
  let anyTime = false;
  let anyCode = false;
  for (const a of grid.athletes) for (const c of a.cells) for (const e of c) {
    if (e.status === 'FINISHED') anyTime = true;
    if (e.code) anyCode = true;
  }
  if (anyTime && !anyCode) return fail("Turn subscripts back on (the 'turn off subscripts' option removes distances), then copy again.");
  if (!anyTime && !anyCode) return fail('The grid has no times yet.');

  if (!legend || !meetList) return { payload: null, errors: [], needsMeetInfo: true };

  if (meetList.length !== grid.dates.length || meetList.some((m, i) => norm(m.date) !== norm(grid.dates[i]))) {
    return fail("The meet list doesn't line up with the grid. Copy the whole page again.");
  }

  const athletes: PasteAthlete[] = [];
  const notes: string[] = [];
  let doubles = 0;
  for (const [ai, a] of grid.athletes.entries()) {
    if (a.junk || a.cells.length > grid.dates.length) return fail(`Row for ${a.name} doesn't line up. Copy the whole page again.`);
    const cells: PasteCell[] = [];
    for (const [mi, entries] of a.cells.entries()) {
      // One result per athlete per race: group a cell's entries by distance.
      const byDistance = new Map<string, RawEntry[]>();
      for (const e of entries) {
        if (!e.code || !legend[e.code]) return fail(`Unknown distance code ${e.code || '(none)'}.`);
        const d = legend[e.code];
        byDistance.set(d, [...(byDistance.get(d) ?? []), e]);
      }
      for (const [distance, list] of byDistance) {
        const finishes = list.filter((e) => e.status === 'FINISHED' && e.time);
        if (finishes.length) {
          const times = finishes.map((e) => e.time as string);
          const best = [...times].sort((x, y) => toSeconds(x) - toSeconds(y))[0];
          const cell: PasteCell = { meet: mi, distance, time: best, status: 'FINISHED' };
          if (times.length > 1) {
            cell.alternatives = times;
            doubles++;
          }
          cells.push(cell);
        } else {
          cells.push({ meet: mi, distance, time: null, status: list[0].status });
        }
      }
    }
    athletes.push({ key: `${gender}:${ai}`, name: a.name, grade: a.grade, cells });
  }
  if (doubles) notes.push(`${doubles} athlete${doubles === 1 ? ' has' : 's have'} two times at one meet; the faster is preselected.`);
  return {
    payload: { gender, meets: meetList.map((m) => ({ date: norm(m.date), name: m.name })), athletes, source: 'text', notes },
    errors: [],
    needsMeetInfo: false,
  };
}

/** Counts used by tests and the preview. */
export function countRaw(grid: TextGrid) {
  let finishes = 0;
  let nonFinishes = 0;
  for (const a of grid.athletes) for (const c of a.cells) for (const e of c) {
    if (e.status === 'FINISHED') finishes++;
    else nonFinishes++;
  }
  return { athletes: grid.athletes.length, finishes, nonFinishes, meets: grid.meets?.length ?? 0 };
}
