// One shared "MM:SS(.d)" / "H:MM:SS(.d)" race-time parser. routes/teams.js
// already has its own inline copy (season CSV import, working, high-blast-
// radius to touch) — this is a second implementation, not a fix for a bug
// in that one, so it's not the "second implementation of the same bug"
// rule 3 warns about; it's a fresh, testable copy for a new call site
// (manual field-results upload) that has no reason to depend on a route
// file's internals. Consolidating the two is a real follow-up, not done
// here to avoid touching teams.js's working import pipeline for an
// unrelated feature.

/**
 * Parses "MM:SS" or "MM:SS.d" or "H:MM:SS(.d)" into seconds. Returns null
 * for anything else — never guesses, callers must treat null as "no time"
 * (e.g. a DNF/DNS row), not 0.
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map((p) => parseFloat(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  const seconds = parts.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
  return seconds > 0 ? seconds : null;
}

module.exports = { parseTimeToSeconds };
