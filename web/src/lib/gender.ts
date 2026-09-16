// Athlete.gender is free text on the way in — an Athletic.net scrape, a
// coach's roster CSV and manual edits have all written something other
// than 'M'/'F' ('Men', 'Women', 'Male', 'boys', ...). Mirrors
// backend/lib/gender.js, which carries the same list for the same reason.
//
// Anything that BUCKETS athletes by gender needs this: the Results Grid
// built one filter chip per raw spelling, so a team whose data held both
// 'M' and 'Men' got Boys, Girls and Men as three separate options — and
// filtering to one silently dropped the athletes stored under the other.

export type GenderKey = 'M' | 'F';

const MALE = ['m', 'male', 'men', 'boy', 'boys'];
const FEMALE = ['f', 'female', 'women', 'girl', 'girls'];

export function normalizeGender(value: string | null | undefined): GenderKey | null {
  if (!value) return null;
  const lower = String(value).trim().toLowerCase();
  if (MALE.includes(lower)) return 'M';
  if (FEMALE.includes(lower)) return 'F';
  return null;
}

/** The label a coach reads. One vocabulary, everywhere it's shown. */
export function genderLabel(value: string | null | undefined): string {
  const key = normalizeGender(value);
  if (key === 'M') return 'Male';
  if (key === 'F') return 'Female';
  return 'Unspecified';
}
