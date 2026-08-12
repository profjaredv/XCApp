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

module.exports = { normalizeGender };
