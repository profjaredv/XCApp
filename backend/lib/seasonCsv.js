// Checks a pasted season CSV before POST /teams/import-season-csv runs the
// import, so a wrong paste (a Field Results CSV, a different season, an
// empty clipboard) is turned away with a reason instead of half-importing.
const { parse } = require('csv-parse/sync');
const { normalizeGender } = require('./gender');

const REQUIRED = ['Race Name', 'Athlete Name', 'Time', 'Race Date'];
const MAX_BYTES = 900_000; // under the server's 1mb JSON limit

function checkSeasonCsv(csv, yearNum) {
  if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return { ok: false, message: 'Pick the season these results are for.' };
  }
  if (typeof csv !== 'string' || !csv.trim()) {
    return { ok: false, message: 'Paste the results the bookmarklet copied first.' };
  }
  if (csv.length > MAX_BYTES) {
    return { ok: false, message: 'That paste is larger than one season of results. Copy it again from the Results Grid page.' };
  }
  let records;
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return { ok: false, message: "That paste isn't a CSV LeadPack can read. Copy it again with the Results Grid bookmarklet." };
  }
  const header = records.length ? Object.keys(records[0]) : [];
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return {
      ok: false,
      message: `That doesn't look like a season results copy (missing ${missing.join(', ')}). Use the Results Grid bookmarklet, not the Field Results one.`,
    };
  }
  const years = new Set(records.map((r) => (String(r['Race Date']).match(/(\d{4})\s*$/) || [])[1]).filter(Boolean));
  if (years.size && !years.has(String(yearNum))) {
    return { ok: false, message: `These results are from ${[...years].join(', ')}, not ${yearNum}. Switch the season and import again.` };
  }
  const genders = new Set(records.map((r) => normalizeGender(r.Gender)).filter(Boolean));
  return { ok: true, rows: records.length, genders };
}

module.exports = { checkSeasonCsv };
