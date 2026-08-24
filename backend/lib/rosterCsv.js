// Roster CSV import — for the athletes an Athletic.net scrape can't see
// yet: freshmen with no race history, or anyone the team hasn't gotten
// around to adding to Athletic.net at all (common in preseason, since
// coaches often source the roster from FinalForms or a plain sheet
// before Athletic.net has anything). Pure and DB-free, same split as
// lib/practicePlanCsv.js — name/DB matching happens in the route, this
// just turns raw CSV rows into validated plain objects.

const REQUIRED_COLUMNS = ['Name'];

function parseIntOrNull(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// rows: parsed via csv-parse's `columns: true` (array of { header: value }
// objects). Returns { athletes, errors, skipped } — same house shape as
// lib/practicePlanCsv.js/lib/fieldResultsCsv.js: errors are per-row and
// never fatal (a bad row is skipped, not a reason to reject the whole
// file), except a missing required column, which fails the whole import
// since there's nothing sensible to do with a file that has no way to
// name people or place them in a grade.
function parseRosterCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { athletes: [], errors: [{ row: 0, message: 'CSV has no data rows.' }], skipped: 0 };
  }

  const headers = Object.keys(rows[0] || {});
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missingRequired.length > 0) {
    return {
      athletes: [],
      errors: [{ row: 0, message: `Missing required column(s): ${missingRequired.join(', ')}` }],
      skipped: 0,
    };
  }
  const hasGrade = headers.includes('Grade');
  const hasGradYear = headers.includes('Graduation Year');
  if (!hasGrade && !hasGradYear) {
    return {
      athletes: [],
      errors: [{ row: 0, message: "Missing required column: 'Grade' or 'Graduation Year'." }],
      skipped: 0,
    };
  }

  const athletes = [];
  const errors = [];
  let skipped = 0;

  rows.forEach((row, idx) => {
    const rowNum = idx + 1; // 1-based data row, matching practicePlanCsv's convention
    const name = (row['Name'] || '').trim();
    if (!name) {
      skipped++;
      return;
    }

    const grade = hasGrade ? parseIntOrNull(row['Grade']) : null;
    const graduationYear = hasGradYear ? parseIntOrNull(row['Graduation Year']) : null;

    if (grade == null && graduationYear == null) {
      errors.push({ row: rowNum, message: `${name}: no valid Grade or Graduation Year.` });
      return;
    }
    if (grade != null && (grade < 9 || grade > 12)) {
      errors.push({ row: rowNum, message: `${name}: grade ${grade} is out of range (9-12).` });
      return;
    }

    const genderRaw = row['Gender'] ? String(row['Gender']).trim() : null;
    // Either header works — teams' preseason sheets use both terms.
    const preferredNameRaw = row['Preferred Name'] || row['Nickname'] || '';
    const preferredName = preferredNameRaw.trim() || null;

    athletes.push({ name, grade, graduationYear, genderRaw, preferredName });
  });

  return { athletes, errors, skipped };
}

module.exports = { parseRosterCsv };
