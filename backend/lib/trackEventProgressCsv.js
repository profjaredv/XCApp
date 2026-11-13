// Checks a pasted track Event Progress CSV before the import route runs,
// same reason lib/seasonCsv.js does this for the XC season CSV: turn away
// a wrong paste (a results-grid CSV, a different season, an empty
// clipboard) with a reason instead of half-importing.
const { parse } = require('csv-parse/sync');

const REQUIRED = ['Athlete Name', 'Event', 'Result', 'Date', 'Season', 'Meet Name'];
const MAX_BYTES = 900_000; // under the server's 1mb JSON limit

function checkEventProgressCsv(csv, yearNum) {
  if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return { ok: false, message: 'Pick the season these results are for.' };
  }
  if (typeof csv !== 'string' || !csv.trim()) {
    return { ok: false, message: 'Paste the Event Progress page first.' };
  }
  if (csv.length > MAX_BYTES) {
    return { ok: false, message: 'That paste is larger than one season of results. Copy it again from the Event Progress page.' };
  }
  let records;
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return { ok: false, message: "That paste isn't a CSV LeadPack can read. Copy the Event Progress page again." };
  }
  const header = records.length ? Object.keys(records[0]) : [];
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return { ok: false, message: `That doesn't look like an Event Progress copy (missing ${missing.join(', ')}).` };
  }
  const seasons = new Set(records.map((r) => r.Season).filter(Boolean));
  if (seasons.size && !seasons.has(String(yearNum))) {
    return { ok: false, message: `These results are from ${[...seasons].join(', ')}, not ${yearNum}. Switch the season and import again.` };
  }
  return { ok: true, rows: records.length };
}

module.exports = { checkEventProgressCsv };
