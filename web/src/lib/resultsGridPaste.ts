// Reads Athletic.net's team Results Grid from HTML the coach copied
// themselves (right-click the page > Inspect > copy the <shared-results-grid>
// element, or any copy that carries the grid's HTML) and turns it into the
// season CSV the import route already takes (backend/lib/seasonCsv.js,
// routes/teams.js importSeasonCsv).
//
// Nothing here touches the network: it parses a string the coach pasted.
// The grid's HTML carries what plain text loses: the athlete id and meet id
// in the links, the meet names, and the distance key. One paste is one
// gender (the page shows one at a time), so the panel takes Mens and Womens
// as two pastes.

export type GridGender = 'Men' | 'Women';

export interface GridMeet {
  date: string; // "Sep 8", as the page shows it (the year comes from the title)
  name: string;
  id: string;
  url: string;
}

export interface GridRow {
  meet: GridMeet;
  athleteName: string;
  athleteUrl: string;
  grade: string;
  gender: GridGender;
  time: string;
  distance: string;
}

export interface ParsedGrid {
  year: number | null;
  gender: GridGender | null;
  teamId: string | null;
  meets: GridMeet[];
  rows: GridRow[];
  /** Things the coach should know before importing (collapsed cells, unread distances...). */
  notes: string[];
  /** Hard problems: nothing should be imported from this paste. */
  errors: string[];
  unknownDistance: number;
}

const ORIGIN = 'https://www.athletic.net';
const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const absolute = (href: string) => (href.startsWith('http') ? href : `${ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`);
const toSeconds = (t: string) => {
  const m = t.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Infinity;
};

/** True when pasted text looks like the grid's HTML rather than a CSV or plain text. */
export function looksLikeGridHtml(text: string): boolean {
  return /<table[\s\S]*?results-table|<shared-results-grid|<table[\s\S]*\/athlete\/\d+/i.test(text);
}

export function parseResultsGrid(html: string): ParsedGrid {
  const out: ParsedGrid = { year: null, gender: null, teamId: null, meets: [], rows: [], notes: [], errors: [], unknownDistance: 0 };
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const title = clean(doc.querySelector('h2')?.textContent) || clean(doc.querySelector('[ngbdropdowntoggle]')?.textContent) || clean(doc.querySelector('title')?.textContent);
  const y = title.match(/\b(19|20)\d{2}\b/);
  out.year = y ? Number(y[0]) : null;
  out.teamId = doc.querySelector('a[href*="/team/"]')?.getAttribute('href')?.match(/\/team\/(\d+)/)?.[1] ?? null;

  const activeGender = clean(doc.querySelector('.gender-switch button.active')?.textContent).toLowerCase();
  if (/women|girl/.test(activeGender)) out.gender = 'Women';
  else if (/men|boy/.test(activeGender)) out.gender = 'Men';

  // Distance key: <sub>6</sub> 5000 Meters. Prefer the legend block; fall back
  // to any <sub> outside the results table.
  const legend: Record<string, string> = {};
  const addLegend = (sub: Element, container: Element) => {
    const copy = container.cloneNode(true) as Element;
    copy.querySelectorAll('sub').forEach((s) => s.remove());
    const key = clean(sub.textContent);
    const label = clean(copy.textContent);
    if (/^\d+$/.test(key) && label && !label.includes('|')) legend[key] = label;
  };
  doc.querySelectorAll('.distance-legend-horizontal span').forEach((span) => {
    const sub = span.querySelector('sub');
    if (sub) addLegend(sub, span);
  });
  if (Object.keys(legend).length === 0) {
    doc.querySelectorAll('sub').forEach((sub) => {
      if (!sub.closest('table.results-table') && sub.parentElement) addLegend(sub, sub.parentElement);
    });
  }

  doc.querySelectorAll('.meet-list-table tbody tr').forEach((tr) => {
    const label = tr.querySelector('label');
    const link = tr.querySelector('a[href*="/meet/"]');
    if (!label || !link) return;
    const href = link.getAttribute('href') ?? '';
    const id = href.match(/\/meet\/(\d+)/)?.[1] ?? '';
    out.meets.push({ date: clean(label.textContent), name: clean(link.textContent), id, url: absolute(href) });
  });

  const table = doc.querySelector('table.results-table');
  if (!table) {
    out.errors.push('No results table found in what was pasted. Copy the whole <shared-results-grid> element.');
    return out;
  }
  if (!out.gender) out.errors.push('Could not tell whether this is the Mens or Womens grid.');
  if (out.meets.length === 0) out.errors.push('The meet list was not in what was pasted, so the meet names are missing. Copy the whole <shared-results-grid> element, not just the table.');
  if (!out.year) out.errors.push('Could not read the season year from the grid title.');
  if (out.errors.length) return out;

  const headerDates = Array.from(table.querySelectorAll('thead th.text-center')).map((th) => clean(th.textContent));
  if (headerDates.length && (headerDates.length !== out.meets.length || headerDates.some((d, i) => d !== out.meets[i].date))) {
    out.errors.push('The grid columns do not line up with the meet list, so times could be put under the wrong meet. Nothing was read.');
    return out;
  }

  const gender = out.gender as GridGender;
  let collapsed = 0;
  let dnf = 0;
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const nameLink = tr.querySelector('td.athlete-name a') ?? Array.from(tr.querySelectorAll('a[href*="/athlete/"]')).find((a) => clean(a.textContent));
    if (!nameLink) return;
    const athleteName = clean(nameLink.textContent);
    const href = nameLink.getAttribute('href') ?? '';
    let grade = clean(tr.querySelector('td.grade')?.textContent);
    if (!/^\d+$/.test(grade)) grade = (tr.className.match(/\by(\d+)\b/) ?? [])[1] ?? '';

    tr.querySelectorAll('td.result-cell').forEach((td, i) => {
      const meet = out.meets[i];
      if (!meet) return;
      // A cell holds one or more "time <subscript>" pairs (a second attempt at
      // the same meet is a second pair, separated by a <br>).
      const entries: Array<{ time: string; key: string }> = [];
      let pending: string | null = null;
      td.querySelectorAll('span').forEach((s) => {
        if (s.classList.contains('subscript')) {
          if (pending !== null) entries.push({ time: pending, key: clean(s.textContent) });
          pending = null;
        } else {
          pending = clean(s.textContent);
        }
      });
      const valid = entries.filter((e) => /^\d+:\d/.test(e.time));
      dnf += entries.length - valid.length;
      // One result per athlete per race: keep the fastest of repeated attempts
      // at the same distance.
      const best = new Map<string, { time: string; key: string }>();
      for (const e of valid) {
        const cur = best.get(e.key);
        if (cur) collapsed++;
        if (!cur || toSeconds(e.time) < toSeconds(cur.time)) best.set(e.key, e);
      }
      best.forEach((e) => {
        const distance = legend[e.key] ?? 'Unknown';
        if (distance === 'Unknown') out.unknownDistance++;
        out.rows.push({
          meet,
          athleteName,
          athleteUrl: absolute(href),
          grade,
          gender,
          time: e.time,
          distance,
        });
      });
    });
  });

  if (collapsed) out.notes.push(`${collapsed} athlete${collapsed === 1 ? ' has' : 's have'} two times at one meet and distance; the faster time was kept.`);
  if (dnf) out.notes.push(`${dnf} DNS/DNF entr${dnf === 1 ? 'y was' : 'ies were'} not imported.`);
  if (out.unknownDistance) {
    out.errors.push(
      `${out.unknownDistance} results have no distance: the distance key (the "Race Distances" line under the table) was not in what was pasted. Copy the whole <shared-results-grid> element.`
    );
  }
  if (out.rows.length === 0 && !out.errors.length) out.errors.push('The grid has no times yet.');
  return out;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** The season CSV (same columns the old scraper wrote) for one or both genders. */
export function gridsToCsv(grids: ParsedGrid[]): string {
  const header = ['Race Name', 'Athlete Name', 'Grade', 'Gender', 'Time', 'Race Date', 'Distance', 'Source URL', 'Athletic Meet ID', 'Athletic Athlete ID'];
  const lines = [header];
  for (const g of grids) {
    for (const r of g.rows) {
      lines.push([r.meet.name, r.athleteName, r.grade, r.gender, r.time, `${r.meet.date}, ${g.year}`, r.distance, r.meet.url, r.meet.id, r.athleteUrl]);
    }
  }
  return lines.map((l) => l.map(csvCell).join(',')).join('\n');
}
