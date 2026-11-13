// LeadPack Track & Field handoff, Section 2 hazard: "US high school field
// events are recorded in feet and inches on Athletic.net, not meters...
// Getting this wrong doesn't error, it just quietly makes every field-event
// PR wrong by a large, confident-looking margin." This file is the one
// place that conversion happens, built and tested against real strings
// copied from Ellensburg's own Event Progress page (feet-inches examples
// below), not assumed — the same discipline lib/distance.js's test table
// used for the XC parser.
//
// markValue on TrackResult is unitless on its own; it is always written
// through parseMark(raw, event.unit) so the unit is never silently lost.

const { parseTimeToSeconds } = require('./time');

// "17' 8.5"" -> 17*12 + 8.5 = 212.5 total inches. Also accepts a bare
// "18-06.25" dash form (not seen on the real page, defensive only — flagged
// here, not treated as confirmed, per the same "don't hardcode confidence
// you don't have" rule the event catalog seed already follows).
const FEET_INCHES_APOSTROPHE = /^(\d+)'\s*(\d+(?:\.\d+)?)"?$/;
const FEET_INCHES_DASH = /^(\d+)-(\d+(?:\.\d+)?)$/;

/** Returns total inches (a Float, per schema.prisma's MarkUnit.FEET_INCHES comment), or null if unparseable. */
function parseFeetInches(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const m = FEET_INCHES_APOSTROPHE.exec(trimmed) || FEET_INCHES_DASH.exec(trimmed);
  if (!m) return null;
  const feet = parseInt(m[1], 10);
  const inches = parseFloat(m[2]);
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  return feet * 12 + inches;
}

/** Total inches back to a display string, "17' 8.5"". */
function formatFeetInches(totalInches) {
  if (totalInches == null || !Number.isFinite(totalInches)) return null;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches - feet * 12) * 100) / 100;
  return `${feet}' ${inches}"`;
}

// Running events: sprints print a bare decimal ("13.42", sometimes with a
// trailing hand-time indicator like "12.80c" — parseFloat already stops at
// the first non-numeric character, so the suffix is dropped for free, same
// as the rest of this codebase's convention). Anything 800m and up prints
// "M:SS.ss", which lib/time.js's parseTimeToSeconds already handles — reused
// here rather than re-implemented, per rule 3.
function parseSeconds(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) return parseTimeToSeconds(trimmed);
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Non-mark outcomes seen on the real Event Progress page's Result column:
 * NT (no time), ND (no distance), NH (no height) all mean "attempted, no
 * mark" — TrackResult.status === 'NM', distinct from DNF (which this page
 * never actually showed; WIAA results report DNS/DQ/SCR instead). SCR
 * (scratched — withdrew before competing) maps to DNS, the closest of the
 * four statuses schema.prisma documents; there is no fifth status to add
 * for it without widening the schema beyond what's been asked for.
 */
const STATUS_TOKENS = {
  NT: 'NM',
  ND: 'NM',
  NH: 'NM',
  DNS: 'DNS',
  DQ: 'DQ',
  SCR: 'DNS',
};

/**
 * Reads one Result cell for a given Event.unit. Returns { markValue,
 * status }. markValue is null whenever status isn't FINISHED — never a
 * fabricated 0, which would corrupt a lower-is-better average the same way
 * a missing distance already does for XC.
 */
function parseMark(raw, unit) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { markValue: null, status: 'DNS' };
  const token = STATUS_TOKENS[trimmed.toUpperCase()];
  if (token) return { markValue: null, status: token };

  const markValue = unit === 'FEET_INCHES' ? parseFeetInches(trimmed) : unit === 'SECONDS' ? parseSeconds(trimmed) : parseFloat(trimmed);
  if (markValue == null || !Number.isFinite(markValue)) return { markValue: null, status: 'NM' };
  return { markValue, status: 'FINISHED' };
}

module.exports = { parseFeetInches, formatFeetInches, parseSeconds, parseMark, STATUS_TOKENS };
