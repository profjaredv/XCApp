// Reads Athletic.net's team Event Progress page
// (athletic.net/team/<id>/track-and-field-outdoor/<year>/event-progress)
// from HTML the coach copied themselves — same reason as
// resultsGridPaste.ts (lib/distance.js's XC sibling): the page is
// Cloudflare-protected and Angular-rendered, so a server-side scraper
// can't reach it, but the coach's own browser already can.
//
// This is a genuinely different page from the Results Grid: one row per
// athlete per event per meet rather than one grid of times, Place/Result/
// Wind/Round/Date/Meet columns instead of a time-by-meet matrix, and marks
// that are sometimes a time, sometimes a feet-inches distance (the
// conversion itself happens server-side, backend/lib/trackMarks.js — this
// file only carries the raw mark text through untouched).
//
// Only "Competition Results" (this season's meet-by-meet marks) is read.
// The page's other section, "Season Records" (one row per season, the
// year's best mark), is deliberately skipped — it's fully derivable from
// Competition Results once imported, parsing it would just be a second,
// redundant source of the same numbers.
//
// The page shows one gender at a time (Men/Women tabs) and a separate
// "Relays" tab this file does not read at all: there is no real relay-tab
// markup to build selectors from yet (per the track handoff's own rule —
// dump a real page before writing selectors, don't guess), so relay
// results stay unsupported until that markup exists.

export type EventProgressGender = 'Men' | 'Women';

export interface EventProgressRow {
  athleteName: string;
  athleticAthleteId: string; // the athlete's profile link, stored verbatim (see athleteMatching.js's athleticIdKey) — not a bare id
  grade: string;
  gender: EventProgressGender;
  event: string; // raw text off the page, e.g. "100m Hurdles" — matched against the Event catalog server-side
  place: string;
  result: string; // raw mark text, e.g. "34' 2.5"" or "13.42" or "DNS"
  wind: string;
  round: string; // raw text, e.g. "V F" — the level prefix has no home in TrackResult today, only the trailing round letter does
  date: string; // "4/30/26" as the page prints it
  meetName: string;
  meetUrl: string;
  athleticMeetId: string;
}

export interface ParsedEventProgress {
  season: number | null;
  outdoor: boolean;
  gender: EventProgressGender | null;
  rows: EventProgressRow[];
  /** Things the coach should know before importing. */
  notes: string[];
  /** Hard problems: nothing should be imported from this paste. */
  errors: string[];
}

const ORIGIN = 'https://www.athletic.net';
const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const absolute = (href: string) => (href.startsWith('http') ? href : `${ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`);

/** True when pasted text looks like the Event Progress page rather than a CSV or plain text. */
export function looksLikeEventProgressHtml(text: string): boolean {
  return /class="athlete-header|class="athlete"|Event Progress/.test(text);
}

export function parseEventProgress(html: string): ParsedEventProgress {
  const out: ParsedEventProgress = { season: null, outdoor: false, gender: null, rows: [], notes: [], errors: [] };
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const title = clean(doc.querySelector('h2')?.textContent);
  const year = title.match(/\b(19|20)\d{2}\b/);
  out.season = year ? Number(year[0]) : null;
  out.outdoor = /outdoor/i.test(title);

  const activeTab = clean(doc.querySelector('.nav-link.active')?.textContent).toLowerCase();
  if (/women/.test(activeTab)) out.gender = 'Women';
  else if (/men/.test(activeTab)) out.gender = 'Men';

  const athleteEls = Array.from(doc.querySelectorAll('.athlete'));
  if (athleteEls.length === 0) {
    out.errors.push('No athletes found in what was pasted. Copy the whole Event Progress page (or at least one gender tab\'s full content), not just a table.');
    return out;
  }
  if (!out.season) out.errors.push('Could not read the season year from the page title.');
  if (!out.outdoor) out.errors.push('This only reads the Outdoor Event Progress page; indoor results are not supported yet.');
  if (!out.gender) {
    out.errors.push('Could not tell whether this is the Mens or Womens tab (or it was the Relays tab, which is not supported yet).');
  }
  if (out.errors.length) return out;

  const gender = out.gender as EventProgressGender;
  let skippedAthletes = 0;
  let skippedRows = 0;

  for (const athleteEl of athleteEls) {
    const nameLink = athleteEl.querySelector('.athlete-header a[href*="/athlete/"]');
    const name = clean(nameLink?.textContent);
    const athleteHref = nameLink?.getAttribute('href') ?? '';
    // Stored verbatim, like the XC import's athlete links — athleticIdKey()
    // pulls the numeric id back out of either shape when matching.
    const athleticAthleteId = athleteHref ? absolute(athleteHref) : '';
    const gradeText = clean(athleteEl.querySelector('.athlete-header small')?.textContent);
    const grade = gradeText.match(/(\d+)/)?.[1] ?? '';
    if (!name) {
      skippedAthletes++;
      continue;
    }

    // "Competition Results" and "Season Records" are two sibling columns
    // under the same athlete block; only the former's container is read.
    const resultsHeading = Array.from(athleteEl.querySelectorAll('h5')).find((h) => clean(h.textContent) === 'Competition Results');
    const container = resultsHeading?.parentElement;
    if (!container) continue; // an athlete with no results logged yet — not an error, just nothing to import

    container.querySelectorAll('.event-header').forEach((header) => {
      const event = clean(header.querySelector('strong')?.textContent);
      const table = header.nextElementSibling;
      if (!event || !table) return;

      table.querySelectorAll('tbody tr').forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 6) {
          skippedRows++;
          return;
        }
        const meetLink = tds[5].querySelector('a[href*="/meet/"]');
        const meetHref = meetLink?.getAttribute('href') ?? '';
        out.rows.push({
          athleteName: name,
          athleticAthleteId,
          grade,
          gender,
          event,
          place: clean(tds[0].textContent),
          result: clean(tds[1].textContent),
          wind: clean(tds[2].textContent),
          round: clean(tds[3].textContent),
          date: clean(tds[4].textContent),
          meetName: clean(meetLink?.textContent),
          meetUrl: meetHref ? absolute(meetHref) : '',
          athleticMeetId: meetHref.match(/\/meet\/(\d+)/)?.[1] ?? '',
        });
      });
    });
  }

  if (skippedAthletes) out.notes.push(`${skippedAthletes} row${skippedAthletes === 1 ? '' : 's'} had no readable athlete name and were skipped.`);
  if (skippedRows) out.notes.push(`${skippedRows} result row${skippedRows === 1 ? '' : 's'} did not have the expected columns and were skipped.`);
  if (out.rows.length === 0) out.errors.push('No competition results found for any athlete on this tab yet.');
  return out;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** The CSV the track import route takes, for one or both gender tabs. */
export function eventProgressToCsv(parsed: ParsedEventProgress[]): string {
  const header = [
    'Athlete Name',
    'Athletic Athlete ID',
    'Grade',
    'Gender',
    'Event',
    'Place',
    'Result',
    'Wind',
    'Round',
    'Date',
    'Season',
    'Meet Name',
    'Meet URL',
    'Athletic Meet ID',
  ];
  const lines = [header];
  for (const p of parsed) {
    for (const r of p.rows) {
      lines.push([
        r.athleteName,
        r.athleticAthleteId,
        r.grade,
        r.gender,
        r.event,
        r.place,
        r.result,
        r.wind,
        r.round,
        r.date,
        String(p.season ?? ''),
        r.meetName,
        r.meetUrl,
        r.athleticMeetId,
      ]);
    }
  }
  return lines.map((l) => l.map(csvCell).join(',')).join('\n');
}
