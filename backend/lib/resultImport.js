// Manual race-results import — the fallback that keeps this app working if
// the Athletic.net scraper is ever blocked.
//
// The scraper's output is Meets + Races + Results. Manual entry already
// covers Meets/Races (isManual) and per-athlete result entry, but there was
// no way to bring in a whole race's results at once: the batch endpoint
// (POST /races/:raceId/results) takes athleteId UUIDs, which a coach with a
// results page in front of them does not have. This module is the missing
// half — turning what a coach can actually obtain (a copied block of text,
// or a CSV) into rows the existing write path can take.
//
// Two input shapes, because they have very different reliability:
//
// 1. DELIMITED WITH A HEADER ROW (csv/tsv) — unambiguous, so it's parsed
//    exactly and never guessed at.
// 2. FREE-FORM PASTED LINES — "1 Callum Woods-Vallejo 12 18:42.3 Kenwood".
//    Place and time are extractable with confidence; splitting the rest
//    into "athlete name" versus "school/team name" is genuinely ambiguous
//    from the text alone. So this module does NOT try to decide: it emits
//    every plausible name span as a candidate and lets the caller resolve
//    them against the team's actual roster, which is the information that
//    settles it. Anything still unresolved is handed to the coach to
//    confirm rather than guessed.
//
// Nothing here touches the database or decides what to write; it is pure so
// it can be tested exhaustively (see test/resultImport.test.js).

const { parseTimeToSeconds } = require('./time');

// mm:ss, mm:ss.d, h:mm:ss(.d). Anchored on word boundaries so it doesn't
// grab part of a date or a bib number.
const TIME_RE = /\b(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\b/;
// A leading finish place: "1", "1.", "1)", "#1".
const LEADING_PLACE_RE = /^#?(\d{1,3})[.)]?$/;

const NAME_HEADERS = ['athlete', 'name', 'runner', 'athlete name'];
const TIME_HEADERS = ['time', 'result', 'finish', 'mark'];
const PLACE_HEADERS = ['place', 'pl', 'pos', 'position', '#'];

function splitLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Tab wins over comma when both appear: a pasted table is tab-separated and
// its cells frequently contain commas ("Woods-Vallejo, Callum").
function detectDelimiter(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  return null;
}

function splitDelimited(line, delimiter) {
  return line.split(delimiter).map((c) => c.trim());
}

function headerIndex(cells, candidates) {
  return cells.findIndex((c) => candidates.includes(c.toLowerCase().trim()));
}

/**
 * True when the first line names its columns. Requires BOTH a name-ish and
 * a time-ish header — one alone is far more likely to be a data row that
 * happens to contain the word "time".
 */
function looksLikeHeader(cells) {
  return headerIndex(cells, NAME_HEADERS) !== -1 && headerIndex(cells, TIME_HEADERS) !== -1;
}

// "Woods-Vallejo, Callum" -> "Callum Woods-Vallejo". Only when there's
// exactly one comma and both sides look like name text, so an address or a
// list is left alone.
function unswapLastFirst(name) {
  const parts = name.split(',');
  if (parts.length !== 2) return name;
  const [last, first] = parts.map((p) => p.trim());
  if (!last || !first || /\d/.test(last) || /\d/.test(first)) return name;
  return `${first} ${last}`;
}

// Tokens that are never part of a runner's name, so they can be dropped
// before building candidates: grade markers, points, bib numbers, pace.
function isNoiseToken(token) {
  if (/^\d+$/.test(token)) return true; // bare number: grade, bib, points
  if (/^(yr|gr|grade)\.?:?$/i.test(token)) return true;
  // Points as Athletic.net actually renders them, sign included ("+12pts").
  // The leading sign is why a \d-anchored pattern missed these.
  if (/^[+-]?\d+(pts?|points?)$/i.test(token)) return true;
  if (/^[+-]\d+$/.test(token)) return true;
  // Track wind readings, e.g. "-1.2m/s".
  if (/^[+-]?\d+(\.\d+)?m\/s$/i.test(token)) return true;
  if (/^\(?\d+\)?$/.test(token)) return true;
  return false;
}

/**
 * Every plausible contiguous name span in the leftover tokens, longest
 * first. A real roster name is 2-4 tokens; longer spans exist so a
 * hyphenated or multi-part surname still appears intact.
 */
function nameCandidates(tokens) {
  const clean = tokens.filter((t) => t && !isNoiseToken(t));
  const out = [];
  const maxLen = Math.min(clean.length, 4);
  for (let len = maxLen; len >= 1; len--) {
    for (let start = 0; start + len <= clean.length; start++) {
      const span = clean.slice(start, start + len).join(' ').trim();
      if (span && !out.includes(span)) out.push(span);
    }
  }
  return out;
}

/**
 * Parses one free-form line into place/time/name candidates.
 * Returns null when the line has no time at all — a header, a section
 * title, or a DNF row we can't score.
 */
function parseFreeformLine(raw) {
  const timeMatch = raw.match(TIME_RE);
  if (!timeMatch) return null;

  const timeSec = parseTimeToSeconds(timeMatch[1]);
  if (timeSec == null) return null;

  const withoutTime = (raw.slice(0, timeMatch.index) + ' ' + raw.slice(timeMatch.index + timeMatch[1].length)).trim();
  const tokens = withoutTime.split(/\s+/).filter(Boolean);

  let place = null;
  if (tokens.length > 0) {
    const m = tokens[0].match(LEADING_PLACE_RE);
    if (m) {
      place = parseInt(m[1], 10);
      tokens.shift();
    }
  }

  // "Woods, Tess 9 Kenwood" — a "Last, First" pair embedded mid-line, which
  // unswapLastFirst can't see because it only handles a string that is
  // ENTIRELY one name. Detect the comma-terminated token and offer the
  // swapped pair as its own candidate; the roster decides whether it's real.
  const swappedPairs = [];
  tokens.forEach((token, i) => {
    if (token.endsWith(',') && tokens[i + 1]) {
      swappedPairs.push(`${tokens[i + 1].replace(/,$/, '')} ${token.replace(/,$/, '')}`);
    }
  });

  const bare = tokens.map((t) => t.replace(/,$/, ''));
  return {
    raw,
    place,
    timeSec,
    // Swapped pairs first: if a line really is "Last, First", that reading
    // is more likely correct than the raw token order it came in as.
    nameCandidates: [...swappedPairs, ...nameCandidates(bare)].filter(
      (c, i, all) => c && all.indexOf(c) === i
    ),
  };
}

/**
 * Parses a delimited row given resolved column indices.
 */
function parseDelimitedRow(cells, idx) {
  const nameRaw = idx.name != null ? cells[idx.name] : null;
  const timeRaw = idx.time != null ? cells[idx.time] : null;
  if (!nameRaw || !timeRaw) return null;

  const timeSec = parseTimeToSeconds(timeRaw);
  if (timeSec == null) return null;

  const name = unswapLastFirst(nameRaw.trim());
  const placeRaw = idx.place != null ? cells[idx.place] : null;
  const place = placeRaw && /^\d+$/.test(placeRaw.trim()) ? parseInt(placeRaw.trim(), 10) : null;

  return { raw: cells.join(' '), place, timeSec, nameCandidates: [name] };
}

/**
 * Parse a pasted or uploaded block of race results.
 *
 * @returns {{ rows: Array<{raw, place, timeSec, nameCandidates: string[]}>, skipped: string[], format: 'delimited'|'freeform'|'empty' }}
 *   `skipped` holds lines that carried no usable time, so the caller can
 *   show the coach exactly what was ignored rather than silently dropping
 *   part of their paste.
 */
function parseResultsText(text) {
  const lines = splitLines(text);
  if (lines.length === 0) return { rows: [], skipped: [], format: 'empty' };

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = delimiter ? splitDelimited(lines[0], delimiter) : [];

  if (delimiter && looksLikeHeader(firstCells)) {
    const idx = {
      name: headerIndex(firstCells, NAME_HEADERS),
      time: headerIndex(firstCells, TIME_HEADERS),
      place: headerIndex(firstCells, PLACE_HEADERS),
    };
    if (idx.place === -1) idx.place = null;

    const rows = [];
    const skipped = [];
    for (const line of lines.slice(1)) {
      const parsed = parseDelimitedRow(splitDelimited(line, delimiter), idx);
      if (parsed) rows.push(parsed);
      else skipped.push(line);
    }
    return { rows, skipped, format: 'delimited' };
  }

  // No header: treat every line as free-form. This also handles headerless
  // CSV, since a comma-separated line still yields the same tokens once
  // commas are treated as whitespace.
  const rows = [];
  const skipped = [];
  for (const line of lines) {
    // Commas do two different jobs here. As a headerless-CSV delimiter
    // ("1,Callum Woods-Vallejo,18:42") they must become whitespace; as a
    // name separator ("Woods, Tess") they must SURVIVE, because that's the
    // only signal parseFreeformLine has that the pair is reversed. A comma
    // followed by a space is the name form by convention; one without is a
    // delimiter. Blanket-stripping commas here is what made the swap
    // handling below silently dead on the real path even though it worked
    // when parseFreeformLine was called directly.
    const parsed = parseFreeformLine(line.replace(/\t+/g, ' ').replace(/,(?!\s)/g, ' '));
    if (parsed) rows.push(parsed);
    else skipped.push(line);
  }
  return { rows, skipped, format: 'freeform' };
}

/**
 * Resolve parsed rows against the team's roster.
 *
 * @param rows        output of parseResultsText().rows
 * @param rosterIndex Map of normalized name -> { athleteId, name }, built by
 *                    the caller from the roster (both legal and preferred
 *                    names should be indexed).
 * @param normalize   the shared name normalizer (lib/athleteMatching.js), passed
 *                    in rather than imported so this module stays pure and the
 *                    matching rule has exactly one definition.
 *
 * Candidates are tried longest-first, so "Callum Woods-Vallejo" wins over a
 * bare "Callum" and a school name that happens to be a single token never
 * beats a real two-part name.
 */
function resolveRows(rows, rosterIndex, normalize) {
  return rows.map((row) => {
    for (const candidate of row.nameCandidates) {
      const hit = rosterIndex.get(normalize(candidate));
      if (hit) {
        return { ...row, athleteId: hit.athleteId, matchedName: hit.name, matchedOn: candidate };
      }
    }
    return { ...row, athleteId: null, matchedName: null, matchedOn: null };
  });
}

module.exports = {
  parseResultsText,
  resolveRows,
  // exported for tests
  unswapLastFirst,
  nameCandidates,
  parseFreeformLine,
};
