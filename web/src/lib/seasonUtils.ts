// Cross country is a fall sport: the "2025 season" runs Aug-Nov 2025. Between
// January and July there is no season underway yet, so the bare calendar year
// points at a season that hasn't happened. Mirrors backend/lib/season.js.
const XC_SEASON_START_MONTH = 7; // August, 0-indexed

export function currentCalendarSeason(now: Date = new Date()): number {
  const year = now.getFullYear();
  return now.getMonth() >= XC_SEASON_START_MONTH ? year : year - 1;
}

// A fall XC "season" year S is the start of school year (S, S+1); a senior
// racing that fall graduates in spring of S+1, not spring of S. So a
// graduation-year athlete is grade 12 during season = graduationYear - 1.
// Mirrors backend/lib/season.js — see the comment there for why getting this
// wrong makes a currently-enrolled senior compute as already graduated.

/** Grade is derived from graduation year, never stored per-athlete. */
export function deriveGrade(graduationYear?: number | null, season?: number | null): number | null {
  if (!Number.isFinite(graduationYear) || !Number.isFinite(season)) return null;
  return 12 - ((graduationYear as number) - (season as number) - 1);
}

export function deriveGraduationYear(grade?: number | null, season?: number | null): number | null {
  if (!Number.isFinite(grade) || !Number.isFinite(season)) return null;
  return (season as number) + 1 + (12 - (grade as number));
}

export function isEnrolled(graduationYear?: number | null, season?: number | null): boolean {
  const grade = deriveGrade(graduationYear, season);
  return grade !== null && grade >= 9 && grade <= 12;
}

export const GRADE_LABELS: Record<number, string> = {
  9: 'Freshman',
  10: 'Sophomore',
  11: 'Junior',
  12: 'Senior',
};

export function gradeLabel(grade?: number | null): string {
  if (!Number.isFinite(grade)) return 'Unknown';
  return GRADE_LABELS[grade as number] ?? `Grade ${grade}`;
}
