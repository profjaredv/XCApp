// Practices-only bulk import (Schedule rework follow-up: "an import/export
// function... so we can get schedules created fairly quickly" — a coach
// typing in a season's worth of a repeating Mon/Wed/Fri structure by hand,
// one day at a time, is the exact slog this exists to skip). Meets keep
// using the separate Athletic.net/scraped-race importers in routes/
// meetOps.js — this is practices only, per the user's explicit scoping.
//
// Pure parsing/validation, no Prisma — testable against fixtures without a
// database, same pattern as lib/fieldResultsCsv.js. Name-based lookups
// (Location/Workout Template/Interval Sheet -> team rows) need the
// database, so those stay in routes/practicePlans.js; this only checks
// that the CSV itself is well-formed.

const REQUIRED_HEADERS = ['Date'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * rows: array of objects from csv-parse({ columns: true }) — one per CSV
 * data row, keyed by header name.
 *
 * Returns { plans, errors, skipped }:
 *   plans: [{ date, location, startTime, announcements, preRun, run,
 *             postRun, workoutTemplate, intervalSheet, published }]
 *   errors: [{ row: <1-based data row number>, message }] — row is
 *           skipped, not fatal to the whole import.
 *   skipped: count of blank/unusable rows (no date at all).
 */
function parsePracticePlanCsv(rows) {
  const plans = [];
  const errors = [];
  let skipped = 0;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { plans, errors: [{ row: 0, message: 'CSV has no data rows.' }], skipped };
  }

  const headers = Object.keys(rows[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      plans,
      errors: [{ row: 0, message: `Missing required column(s): ${missingHeaders.join(', ')}` }],
      skipped,
    };
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const dateRaw = (row['Date'] || '').trim();
    if (!dateRaw) {
      skipped++;
      return;
    }
    if (!DATE_RE.test(dateRaw)) {
      errors.push({ row: rowNum, message: `Unparseable date "${dateRaw}" (expected YYYY-MM-DD).` });
      return;
    }

    const publishedRaw = (row['Published'] || '').trim().toUpperCase();

    plans.push({
      date: dateRaw,
      location: (row['Location'] || '').trim() || null,
      startTime: (row['Start Time'] || '').trim() || null,
      announcements: (row['Announcements'] || '').trim() || null,
      preRun: (row['Pre Run'] || '').trim() || null,
      run: (row['Run'] || '').trim() || null,
      postRun: (row['Post Run'] || '').trim() || null,
      workoutTemplate: (row['Workout Template'] || '').trim() || null,
      intervalSheet: (row['Interval Sheet'] || '').trim() || null,
      published: publishedRaw === 'TRUE' || publishedRaw === 'YES',
    });
  });

  return { plans, errors, skipped };
}

module.exports = { parsePracticePlanCsv, REQUIRED_HEADERS };
