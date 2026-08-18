const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTodayBracketed,
  pickTodaySeasonCandidate,
  isInSeason,
  pickPastSeasonForSummary,
} = require('../lib/season');

function season(year, { isActive = false, startDate = null, endDate = null } = {}) {
  return { id: `season-${year}`, year, isActive, startDate, endDate };
}

const AUG_18_2026 = new Date('2026-08-18T12:00:00Z');
const SEPT_15_2026 = new Date('2026-09-15T12:00:00Z');

test('isTodayBracketed: true when today falls within start/end dates', () => {
  const s = season(2026, { startDate: '2026-08-25', endDate: '2026-11-15' });
  assert.equal(isTodayBracketed(s, AUG_18_2026), false);
  assert.equal(isTodayBracketed(s, SEPT_15_2026), true);
});

test('isTodayBracketed: false when dates are missing', () => {
  assert.equal(isTodayBracketed(season(2026), AUG_18_2026), false);
});

test('pickTodaySeasonCandidate: prefers isActive over date-bracketed or most recent', () => {
  const seasons = [season(2026, { isActive: false, startDate: '2026-08-25', endDate: '2026-11-15' }), season(2025, { isActive: true })];
  const candidate = pickTodaySeasonCandidate(seasons, SEPT_15_2026);
  assert.equal(candidate.year, 2025);
});

test('pickTodaySeasonCandidate: falls back to date-bracketed season when none is active', () => {
  const seasons = [season(2026, { startDate: '2026-08-25', endDate: '2026-11-15' }), season(2025)];
  const candidate = pickTodaySeasonCandidate(seasons, SEPT_15_2026);
  assert.equal(candidate.year, 2026);
});

test('pickTodaySeasonCandidate: falls back to most recent season when nothing else matches', () => {
  const seasons = [season(2025), season(2024)];
  const candidate = pickTodaySeasonCandidate(seasons, AUG_18_2026);
  assert.equal(candidate.year, 2025);
});

test('isInSeason: true when isActive and dates bracket today', () => {
  const s = season(2026, { isActive: true, startDate: '2026-08-25', endDate: '2026-11-15' });
  assert.equal(isInSeason(s, SEPT_15_2026), true);
});

test('isInSeason: false when isActive but today is before the season starts (two weeks out)', () => {
  const s = season(2026, { isActive: true, startDate: '2026-08-25', endDate: '2026-11-15' });
  assert.equal(isInSeason(s, AUG_18_2026), false);
});

test('isInSeason: true when isActive with no dates configured at all', () => {
  const s = season(2026, { isActive: true });
  assert.equal(isInSeason(s, AUG_18_2026), true);
});

test('isInSeason: false for null season', () => {
  assert.equal(isInSeason(null, AUG_18_2026), false);
});

test('pickPastSeasonForSummary: uses the candidate itself once its dates have lapsed', () => {
  const seasons = [season(2025, { endDate: '2025-11-01' })];
  const past = pickPastSeasonForSummary(seasons, seasons[0], AUG_18_2026);
  assert.equal(past.year, 2025);
});

test('pickPastSeasonForSummary: prefers the most recent PAST season over a future not-yet-started candidate', () => {
  // The real pre-season case this whole page is built for: 2026 exists and
  // is flagged active two weeks early, but "last season" should mean 2025,
  // not a 2026 season that has zero races yet.
  const seasons = [season(2026, { isActive: true, startDate: '2026-08-25', endDate: '2026-11-15' }), season(2025, { endDate: '2025-11-01' })];
  const candidate = pickTodaySeasonCandidate(seasons, AUG_18_2026);
  const past = pickPastSeasonForSummary(seasons, candidate, AUG_18_2026);
  assert.equal(past.year, 2025);
});
