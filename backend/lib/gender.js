// `Athlete.gender` is free text on the way in — Athletic.net scrape rows, a
// coach-uploaded roster CSV, and manual edits have all written values other
// than exactly 'M'/'F' ('Men', 'Women', 'Male', 'boys', ...). Anything that
// buckets athletes by gender (Groups page columns, boys/girls splits) needs
// this normalization or it silently drops athletes whose value doesn't
// match a strict `=== 'M'` check.
function normalizeGender(value) {
  if (!value) return null;
  const lower = value.toString().trim().toLowerCase();
  if (['m', 'male', 'men', 'boy', 'boys'].includes(lower)) return 'M';
  if (['f', 'female', 'women', 'girl', 'girls'].includes(lower)) return 'F';
  return null;
}

// A FieldResult's own gender column can come back blank even from a real
// upload — not every athletic.net page layout carries a separate Mens/
// Womens Results header to read it from (see web/src/lib/
// fieldResultsBookmarklet.ts's genderFromLabel for the client-side half
// of this same fallback; a confirmed real case, Ellensburg 9/25/26,
// uploaded 552 finishers this way). A division's own text routinely
// spells gender out anyway ("Boys Varsity", "Girls JV") even when the
// separate gender column doesn't, so this is the last resort before a
// division goes unattributed to either side of team scoring.
function genderFromDivisionLabel(label) {
  if (!label) return null;
  const lower = label.toString().toLowerCase();
  if (/women|girl/.test(lower)) return 'F';
  if (/men|boy/.test(lower)) return 'M';
  return null;
}

// The one place every FieldResult consumer (lib/meetScoring.js,
// lib/fieldPlacement.js, lib/fieldResultsCsv.js) should resolve gender
// from — the explicit column first, the division text as fallback — so
// none of them can drift out of sync on which signal wins or in what
// order.
function resolveFieldResultGender(fr) {
  return normalizeGender(fr && fr.gender) || genderFromDivisionLabel(fr && fr.division) || null;
}

module.exports = { normalizeGender, genderFromDivisionLabel, resolveFieldResultGender };
