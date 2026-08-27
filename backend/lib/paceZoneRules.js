// The rule vocabulary a pace zone is written in, and the validation that
// keeps a malformed one out of the database.
//
// This file is the SERVER's half: it validates and normalises what a coach
// submits. It deliberately does no pace arithmetic — resolving a rule to
// actual paces needs an athlete's race, happens live as a coach flips
// between races, and lives in web/src/lib/paceZones.ts. Two rule shapes
// cover every definition a coach has actually written down for us:
//
//   OFFSET — "Distance = 2-3 minutes slower than best 1 mile time"
//   RANGE  — "VO2 = 2 mile to 5k race pace"
//
// Both yield a pace RANGE, because that is how coaches write them.

const RULE_TYPES = ['OFFSET', 'RANGE'];

// Sanity bounds, not opinions about training. They exist so a typo (a
// coach typing seconds where the field wants metres, or 3000 minutes)
// fails loudly at the edge instead of producing a nonsense pace three
// screens away.
const MIN_DISTANCE_METERS = 100;
const MAX_DISTANCE_METERS = 100000;
// Per mile. ±20 minutes is far past anything real in either direction, and
// negative genuinely is allowed: "15 seconds FASTER than 5k pace" is a
// zone a coach can legitimately want.
const MAX_OFFSET_SEC = 20 * 60;

const MAX_ABBREVIATION_LENGTH = 12;
const MAX_NAME_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;

function isInt(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function distanceError(label, value) {
  if (!isInt(value)) return `${label} must be a whole number of meters.`;
  if (value < MIN_DISTANCE_METERS || value > MAX_DISTANCE_METERS) {
    return `${label} must be between ${MIN_DISTANCE_METERS} and ${MAX_DISTANCE_METERS} meters.`;
  }
  return null;
}

function offsetError(label, value) {
  if (!isInt(value)) return `${label} must be a whole number of seconds.`;
  if (Math.abs(value) > MAX_OFFSET_SEC) return `${label} must be within ${MAX_OFFSET_SEC / 60} minutes per mile.`;
  return null;
}

/**
 * Validate and normalise one zone as submitted by a coach.
 *
 * Returns { ok: true, value } with exactly the columns PaceZone stores —
 * fields belonging to the OTHER rule type are explicitly nulled rather
 * than left alone, so switching a zone from RANGE to OFFSET can't leave
 * stale range distances behind to confuse the next reader.
 *
 * Returns { ok: false, error } with a message meant for the coach.
 */
function normalizePaceZone(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'A zone must be an object.' };

  const abbreviation = typeof input.abbreviation === 'string' ? input.abbreviation.trim() : '';
  if (!abbreviation) return { ok: false, error: 'Abbreviation is required (e.g. "T").' };
  if (abbreviation.length > MAX_ABBREVIATION_LENGTH) {
    return { ok: false, error: `Abbreviation must be ${MAX_ABBREVIATION_LENGTH} characters or fewer.` };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Name is required (e.g. "Threshold").' };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };

  const notesRaw = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notesRaw.length > MAX_NOTES_LENGTH) {
    return { ok: false, error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` };
  }
  const notes = notesRaw || null;

  const ruleType = input.ruleType;
  if (!RULE_TYPES.includes(ruleType)) {
    return { ok: false, error: `Rule type must be one of: ${RULE_TYPES.join(', ')}.` };
  }

  const sortOrder = isInt(input.sortOrder) ? input.sortOrder : 0;
  const base = { abbreviation, name, notes, sortOrder, ruleType };

  if (ruleType === 'OFFSET') {
    const refErr = distanceError('Reference distance', input.refDistanceMeters);
    if (refErr) return { ok: false, error: refErr };
    const fastErr = offsetError('Fast offset', input.offsetFastSec);
    if (fastErr) return { ok: false, error: fastErr };
    const slowErr = offsetError('Slow offset', input.offsetSlowSec);
    if (slowErr) return { ok: false, error: slowErr };
    // Accept either order and store it sorted. A coach typing "2-3 minutes
    // slower" and one typing "3-2" mean the same zone; making them equal
    // here means every reader downstream can trust fast <= slow.
    const fast = Math.min(input.offsetFastSec, input.offsetSlowSec);
    const slow = Math.max(input.offsetFastSec, input.offsetSlowSec);
    return {
      ok: true,
      value: {
        ...base,
        refDistanceMeters: input.refDistanceMeters,
        offsetFastSec: fast,
        offsetSlowSec: slow,
        rangeDistanceAMeters: null,
        rangeDistanceBMeters: null,
      },
    };
  }

  const aErr = distanceError('First distance', input.rangeDistanceAMeters);
  if (aErr) return { ok: false, error: aErr };
  const bErr = distanceError('Second distance', input.rangeDistanceBMeters);
  if (bErr) return { ok: false, error: bErr };
  if (input.rangeDistanceAMeters === input.rangeDistanceBMeters) {
    return { ok: false, error: 'A range needs two different distances.' };
  }
  return {
    ok: true,
    value: {
      ...base,
      refDistanceMeters: null,
      offsetFastSec: null,
      offsetSlowSec: null,
      rangeDistanceAMeters: input.rangeDistanceAMeters,
      rangeDistanceBMeters: input.rangeDistanceBMeters,
    },
  };
}

/**
 * Validate a whole submitted set. Rejects duplicate abbreviations here
 * rather than letting the database's unique index surface as a 500 — and
 * catches the case where two zones differ only by capitalisation ("t" and
 * "T"), which the index would happily allow but a coach would read as one.
 */
function normalizePaceZoneSet(zones) {
  if (!Array.isArray(zones)) return { ok: false, error: 'Expected a list of zones.' };
  if (zones.length > 20) return { ok: false, error: 'A team can define at most 20 pace zones.' };

  const out = [];
  const seen = new Set();
  for (let i = 0; i < zones.length; i += 1) {
    const result = normalizePaceZone(zones[i]);
    if (!result.ok) return { ok: false, error: `Zone ${i + 1}: ${result.error}` };
    const key = result.value.abbreviation.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Two zones share the abbreviation "${result.value.abbreviation}".` };
    }
    seen.add(key);
    // Position in the submitted list IS the display order; a coach
    // reordering rows should not also have to renumber anything.
    out.push({ ...result.value, sortOrder: i });
  }
  return { ok: true, value: out };
}

module.exports = {
  RULE_TYPES,
  MIN_DISTANCE_METERS,
  MAX_DISTANCE_METERS,
  MAX_OFFSET_SEC,
  normalizePaceZone,
  normalizePaceZoneSet,
};

// --- How a saved thing (an interval session, say) REFERS to a zone ---
//
// Never by PaceZone.id. Saving the zone set is a delete-then-insert (see
// routes/paceZones.js for why), so every custom zone gets a fresh uuid on
// every save — anything holding an id would be orphaned the first time a
// coach edited an unrelated zone. What is stable is:
//
//   'mcm-vo2'   a default zone, keyed by its constant id
//   'team:DIS'  a team's own zone, keyed by its abbreviation, which is
//               unique per team and survives a save
//
// The default keys are duplicated from MCMILLAN_ZONES in
// web/src/lib/paceZones.ts because that constant is the frontend's (the
// paces are computed client-side and the server never needs the rules).
// test/paceZoneKeys.test.js reads that file and fails if the two lists
// drift, so this cannot silently rot.
const DEFAULT_ZONE_KEYS = ['mcm-speed', 'mcm-vo2', 'mcm-tempo', 'mcm-ss', 'mcm-easy', 'mcm-recovery'];

const TEAM_ZONE_PREFIX = 'team:';

/**
 * Split a zone key into what it points at. Returns null for anything
 * malformed — callers treat that as "not a zone", never as a default.
 */
function parseZoneKey(key) {
  if (typeof key !== 'string' || !key) return null;
  if (DEFAULT_ZONE_KEYS.includes(key)) return { kind: 'default', key };
  if (key.startsWith(TEAM_ZONE_PREFIX)) {
    const abbreviation = key.slice(TEAM_ZONE_PREFIX.length);
    if (!abbreviation || abbreviation.length > MAX_ABBREVIATION_LENGTH) return null;
    return { kind: 'team', key, abbreviation };
  }
  return null;
}

function teamZoneKey(abbreviation) {
  return `${TEAM_ZONE_PREFIX}${abbreviation}`;
}

/**
 * Is this key usable by this team right now?
 *
 * `teamAbbreviations` is the team's current custom-zone abbreviations. A
 * default key is always fine. A team key is only accepted if the zone
 * actually exists — otherwise a coach could pin a session to a zone that
 * was never defined and get no suggested paces with no explanation.
 *
 * Note this is a check for WRITES. Reading an old session whose zone has
 * since been deleted must still work; that is what the stored label is
 * for.
 */
function isUsableZoneKey(key, teamAbbreviations) {
  const parsed = parseZoneKey(key);
  if (!parsed) return false;
  if (parsed.kind === 'default') return true;
  return teamAbbreviations.includes(parsed.abbreviation);
}

// The three zone names interval sessions used before team-defined zones
// existed, mapped to their equivalents in the default set. These are the
// same zones under different authors' names — Daniels' Threshold is a
// tempo effort, his Interval is VO2max work, his Repetition is short speed
// work — so this is a rename, not a reinterpretation of anyone's data.
const LEGACY_ZONE_MAP = {
  threshold: 'mcm-tempo',
  interval: 'mcm-vo2',
  repetition: 'mcm-speed',
};

module.exports.DEFAULT_ZONE_KEYS = DEFAULT_ZONE_KEYS;
module.exports.TEAM_ZONE_PREFIX = TEAM_ZONE_PREFIX;
module.exports.LEGACY_ZONE_MAP = LEGACY_ZONE_MAP;
module.exports.parseZoneKey = parseZoneKey;
module.exports.teamZoneKey = teamZoneKey;
module.exports.isUsableZoneKey = isUsableZoneKey;
