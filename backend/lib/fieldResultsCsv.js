// Manual field-results upload (Phase 2 step 3's fallback — the automated
// scraper, scrape_meet_playwright.js, is blocked in this environment:
// Cloudflare's JS challenge blocks curl, and Playwright's browser process
// can't reach the network at all in this sandbox — see NOTES.md, "Phase 2,
// step 3"). Until the scraper exists, a coach viewing a meet's full results
// page in their own browser can copy it into a CSV and upload it here —
// same end state (Race.fieldMeanSec/fieldMedianSec/fieldFinisherCount
// populated, band analytics' normalizationAvailable flips on), no scraper
// required. This will also stay useful once the scraper exists, for races
// it can't reach.
//
// Pure parsing/validation, no Prisma — testable against fixtures without a
// database, same pattern as lib/bandAnalytics.js.

const { parseTimeToSeconds } = require('./time');

const VALID_STATUSES = new Set(['FINISHED', 'DNF', 'DNS', 'DQ']);

const REQUIRED_HEADERS = ['Athlete Name'];

/**
 * rows: array of objects from csv-parse({ columns: true }) — one per CSV
 * data row, keyed by header name.
 *
 * Returns { results, errors, skipped }:
 *   results: [{ athleteName, schoolName, gender, grade, timeSec, place, status }]
 *   errors:  [{ row: <1-based data row number>, message }] — row is skipped,
 *            not fatal to the whole upload.
 *   skipped: count of blank/unusable rows (no athlete name at all).
 */
function parseFieldResultsCsv(rows) {
  const results = [];
  const errors = [];
  let skipped = 0;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { results, errors: [{ row: 0, message: 'CSV has no data rows.' }], skipped };
  }

  const headers = Object.keys(rows[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      results,
      errors: [{ row: 0, message: `Missing required column(s): ${missingHeaders.join(', ')}` }],
      skipped,
    };
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const athleteName = (row['Athlete Name'] || '').trim();
    if (!athleteName) {
      skipped++;
      return;
    }

    const statusRaw = (row['Status'] || 'FINISHED').trim().toUpperCase();
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : null;
    if (!status) {
      errors.push({ row: rowNum, message: `Unrecognized status "${row['Status']}" for ${athleteName} (expected FINISHED, DNF, DNS, or DQ).` });
      return;
    }

    const timeRaw = (row['Time'] || '').trim();
    let timeSec = null;
    if (timeRaw) {
      timeSec = parseTimeToSeconds(timeRaw);
      if (timeSec == null) {
        errors.push({ row: rowNum, message: `Unparseable time "${timeRaw}" for ${athleteName} (expected MM:SS or MM:SS.d).` });
        return;
      }
    } else if (status === 'FINISHED') {
      errors.push({ row: rowNum, message: `${athleteName} has no time and no DNF/DNS/DQ status.` });
      return;
    }

    const gradeRaw = (row['Grade'] || '').trim();
    const grade = gradeRaw ? parseInt(gradeRaw, 10) : null;

    const placeRaw = (row['Place'] || '').trim();
    const place = placeRaw ? parseInt(placeRaw, 10) : null;

    results.push({
      athleteName,
      schoolName: (row['School'] || '').trim() || null,
      gender: (row['Gender'] || '').trim() || null,
      grade: Number.isFinite(grade) ? grade : null,
      timeSec,
      place: Number.isFinite(place) ? place : null,
      status,
    });
  });

  return { results, errors, skipped };
}

module.exports = { parseFieldResultsCsv, VALID_STATUSES, REQUIRED_HEADERS };
