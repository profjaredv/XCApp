import { describe, it, expect } from 'vitest';
import { deriveGrade, deriveGraduationYear, gradeLabel, isEnrolled } from './seasonUtils';

// Grade is derived from graduation year everywhere in this app, never
// stored per-athlete. The roster's "Set class year" editor runs this in
// reverse — a coach picks the grade, and the year is worked back — so the
// two have to agree exactly or a coach saying "sophomore" gets a junior.

describe('deriveGrade / deriveGraduationYear round-trip', () => {
  it('a sophomore in 2025 is class of 2028, and back again', () => {
    // The reported case: an athlete showing as a freshman who is a sophomore.
    expect(deriveGraduationYear(10, 2025)).toBe(2028);
    expect(deriveGrade(2028, 2025)).toBe(10);
  });

  it.each([9, 10, 11, 12])('grade %i round-trips through the graduation year', (grade) => {
    for (const season of [2023, 2024, 2025, 2026]) {
      const gradYear = deriveGraduationYear(grade, season)!;
      expect(deriveGrade(gradYear, season)).toBe(grade);
    }
  });

  it('tracks the athlete forward through their career', () => {
    const classOf2028 = 2028;
    expect(deriveGrade(classOf2028, 2024)).toBe(9);
    expect(deriveGrade(classOf2028, 2025)).toBe(10);
    expect(deriveGrade(classOf2028, 2026)).toBe(11);
    expect(deriveGrade(classOf2028, 2027)).toBe(12);
    // The fall AFTER they graduate.
    expect(deriveGrade(classOf2028, 2028)).toBe(13);
  });

  it('a senior racing in the fall has not graduated yet', () => {
    // The academic-year offset: a fall season S is the start of school year
    // (S, S+1), so a class-of-2026 senior is grade 12 in season 2025.
    expect(deriveGrade(2026, 2025)).toBe(12);
    expect(isEnrolled(2026, 2025)).toBe(true);
  });

  it('returns null rather than guessing when either input is missing', () => {
    expect(deriveGrade(null, 2025)).toBeNull();
    expect(deriveGrade(2028, null)).toBeNull();
    expect(deriveGraduationYear(null, 2025)).toBeNull();
    expect(deriveGraduationYear(10, null)).toBeNull();
  });
});

describe('gradeLabel', () => {
  it('names the four high-school grades', () => {
    expect(gradeLabel(9)).toBe('Freshman');
    expect(gradeLabel(10)).toBe('Sophomore');
    expect(gradeLabel(11)).toBe('Junior');
    expect(gradeLabel(12)).toBe('Senior');
  });

  it('says Unknown for an unknown grade rather than picking one', () => {
    // This is what the analytics fix relies on: null must read as
    // "Unknown", never as a default that looks like a real answer.
    expect(gradeLabel(null)).toBe('Unknown');
    expect(gradeLabel(undefined)).toBe('Unknown');
  });

  it('does not silently label an out-of-range grade as a real one', () => {
    expect(gradeLabel(0)).toBe('Grade 0');
    expect(gradeLabel(13)).toBe('Grade 13');
  });
});
