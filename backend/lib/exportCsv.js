// CSV writing for exports.
//
// Separate from lib/rosterCsv.js, lib/practicePlanCsv.js and
// lib/fieldResultsCsv.js — those are all PARSERS for import, and none of
// them writes anything. There is a toCsv on the frontend
// (web/src/lib/csvParse.ts) but exports are built server-side, where that
// one cannot be reached.

/**
 * Excel and Sheets both read a leading =, +, - or @ in a cell as the start
 * of a formula. A roster containing an athlete nicknamed "=Speedy" becomes
 * a broken cell at best; the general form of this is CSV injection, where
 * a crafted cell runs a formula in whoever opens the file. Prefixing with
 * an apostrophe is the standard defence and is invisible in the
 * spreadsheet.
 */
function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value) {
  if (value === null || value === undefined) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  const text = neutralizeFormula(String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Rows of plain objects to a CSV string.
 *
 * Columns come from the union of every row's keys, not just the first
 * row's: Prisma returns the same shape per model so in practice they
 * match, but a silently truncated export is exactly the failure this
 * feature exists to prevent. Header order follows first appearance, which
 * keeps id/name-ish columns at the left where they are readable.
 */
function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => cell(row?.[h])).join(','));
  }
  // CRLF: the line ending every spreadsheet on Windows expects, and which
  // everything else tolerates.
  return lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, neutralizeFormula };
