// Roster CSV import — for the athletes an Athletic.net scrape can't see
// yet: freshmen with no race history, or anyone the team hasn't gotten
// around to adding to Athletic.net at all (common in preseason, since
// coaches often source the roster from FinalForms or a plain sheet
// before Athletic.net has anything). Pure and DB-free, same split as
// lib/practicePlanCsv.js — name/DB matching happens in the route, this
// just turns raw CSV rows into validated plain objects.

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
  // A single 'Name' column, or a split 'First Name'/'Last Name' pair —
  // FinalForms-style exports use the latter — either is enough to place
  // someone on the roster.
  const hasName = headers.includes('Name');
  const hasFirstName = headers.includes('First Name');
  const hasLastName = headers.includes('Last Name');
  if (!hasName && !hasFirstName && !hasLastName) {
    return {
      athletes: [],
      errors: [{ row: 0, message: "Missing required column(s): Name (or First Name / Last Name)" }],
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
    const lastName = hasLastName ? String(row['Last Name'] || '').trim() : '';
    const name = hasName
      ? (row['Name'] || '').trim()
      : [row['First Name'], row['Last Name']]
          .map((part) => (part == null ? '' : String(part).trim()))
          .filter(Boolean)
          .join(' ');
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
    // 'Preferred Name'/'Nickname' is a ready-made full display name — used
    // as-is. 'Preferred First Name' (FinalForms) is just the first name, so
    // it's paired with the row's own last name to keep the surname a coach
    // relies on to tell two same-first-name athletes apart.
    const preferredFullRaw = String(row['Preferred Name'] || row['Nickname'] || '').trim();
    const preferredFirstRaw = String(row['Preferred First Name'] || '').trim();
    const preferredName =
      preferredFullRaw || (preferredFirstRaw ? [preferredFirstRaw, lastName].filter(Boolean).join(' ') : null) || null;

    athletes.push({ name, grade, graduationYear, genderRaw, preferredName });
  });

  return { athletes, errors, skipped };
}

module.exports = { parseRosterCsv };
