// Server-side validation for athlete-imported training logs.
//
// The parsing happens in the browser (see web/src/lib/activityFiles): a
// .fit file is binary, an Apple Health export is hundreds of megabytes,
// and express.json() is capped at 1mb — so the client decodes the file and
// posts summary rows. The raw health file never leaves the athlete's
// device, which is the privacy story, but it also means EVERY value
// arriving here was produced by code we do not control at runtime. This
// module is therefore the real gate, not a formality: treat the request
// body as hostile even though the client is our own.

// Wider than any plausible run, narrow enough to catch a unit mix-up
// (kilometres posted as miles, milliseconds posted as seconds) or a
// garbage row from a malformed file.
const MAX_DISTANCE_MI = 200;
const MIN_DURATION_SEC = 30;
const MAX_DURATION_SEC = 24 * 60 * 60;
const MAX_HR_BPM = 260;
const MIN_HR_BPM = 20;
const MAX_ELEVATION_FT = 40000;

// Per-request row cap. The client chunks anything larger. Sized so that a
// full batch stays comfortably inside express.json's 1mb limit even with
// long external ids.
const MAX_ROWS_PER_REQUEST = 500;

const MAX_EXTERNAL_ID_LEN = 200;
const MAX_FILE_NAME_LEN = 260;

// Import can only ever produce these three. `interval` and `tempo` are
// coach vocabulary — a file cannot know a workout's intent, and guessing
// would put fiction in front of a coach. `race` is excluded for a stronger
// reason: races live in Result and drive PRs, season bests and every
// analytics surface. A heuristic that promoted a hard tempo to `race` here
// would quietly corrupt that. An athlete can always re-type a log as
// whatever it really was.
const IMPORTABLE_TYPES = new Set(['easy', 'long', 'other']);

// Every source an import may claim. 'manual' and 'interval_session' are
// deliberately absent: those describe rows this endpoint must never
// create, and accepting them would let a file masquerade as hand-entered.
const IMPORT_SOURCES = new Set([
  'file_gpx',
  'file_tcx',
  'file_fit',
  'strava_export',
  'apple_health',
  'garmin_csv',
]);

// The calendar day and the instant are both supplied by the client, on
// purpose. `date` is the athlete's LOCAL day; the server has no idea what
// that is (nothing in this schema stores a timezone for a team or an
// athlete), so deriving it here from startedAt would shift every early
// morning run to the previous day for anyone west of UTC. What the server
// CAN do is refuse a pair that cannot describe the same run.
const MAX_DATE_SKEW_MS = 36 * 60 * 60 * 1000;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInstant(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined; // present but wrong type
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// Returns { ok: true, row } or { ok: false, reason } — a reason string, so
// the caller can hand the athlete a count per cause ("12 duplicates, 3
// without a distance") instead of a bare number.
function validateImportRow(raw, { now = new Date(), earliestAllowed } = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'malformed' };

  const date = parseDateOnly(raw.date);
  if (!date) return { ok: false, reason: 'badDate' };

  const startedAt = parseInstant(raw.startedAt);
  if (startedAt === undefined) return { ok: false, reason: 'badDate' };

  // A run in the future is a clock or timezone bug, never a real log.
  // One day of slack absorbs a device set ahead and the athlete being east
  // of UTC when the server is not.
  const upperBound = now.getTime() + 24 * 60 * 60 * 1000;
  if (date.getTime() > upperBound) return { ok: false, reason: 'future' };
  if (startedAt && startedAt.getTime() > upperBound) return { ok: false, reason: 'future' };

  if (earliestAllowed && date.getTime() < earliestAllowed.getTime()) {
    return { ok: false, reason: 'tooOld' };
  }

  // The two must agree about which run this is.
  if (startedAt && Math.abs(startedAt.getTime() - date.getTime()) > MAX_DATE_SKEW_MS) {
    return { ok: false, reason: 'dateMismatch' };
  }

  if (!IMPORTABLE_TYPES.has(raw.type)) return { ok: false, reason: 'badType' };

  // A row with neither a distance nor a duration is not a workout — it is
  // a row the parser could not read. Importing it would put an empty line
  // in the athlete's log and a zero in their weekly mileage.
  const hasDistance = isFiniteNumber(raw.distanceMi) && raw.distanceMi > 0;
  const hasDuration = Number.isInteger(raw.durationSec) && raw.durationSec > 0;
  if (!hasDistance && !hasDuration) return { ok: false, reason: 'empty' };

  if (hasDistance && raw.distanceMi > MAX_DISTANCE_MI) return { ok: false, reason: 'outOfRange' };
  if (hasDuration && (raw.durationSec < MIN_DURATION_SEC || raw.durationSec > MAX_DURATION_SEC)) {
    return { ok: false, reason: 'outOfRange' };
  }

  if (typeof raw.externalId !== 'string' || !raw.externalId) {
    return { ok: false, reason: 'noExternalId' };
  }
  if (raw.externalId.length > MAX_EXTERNAL_ID_LEN) return { ok: false, reason: 'noExternalId' };

  let avgHrBpm = null;
  if (raw.avgHrBpm !== undefined && raw.avgHrBpm !== null) {
    if (!Number.isInteger(raw.avgHrBpm) || raw.avgHrBpm < MIN_HR_BPM || raw.avgHrBpm > MAX_HR_BPM) {
      // A bad heart rate is not worth rejecting a real run over — drop the
      // field, keep the mileage.
      avgHrBpm = null;
    } else {
      avgHrBpm = raw.avgHrBpm;
    }
  }

  let elevationFt = null;
  if (isFiniteNumber(raw.elevationFt) && raw.elevationFt >= 0 && raw.elevationFt <= MAX_ELEVATION_FT) {
    elevationFt = raw.elevationFt;
  }

  return {
    ok: true,
    row: {
      date,
      startedAt: startedAt ?? null,
      type: raw.type,
      distanceMi: hasDistance ? raw.distanceMi : null,
      durationSec: hasDuration ? raw.durationSec : null,
      avgHrBpm,
      elevationFt,
      externalId: raw.externalId,
      notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : null,
    },
  };
}

// Two rows in the SAME file can carry the same externalId (Strava archives
// have been known to contain a duplicate export of one activity). The
// database unique index would reject the whole createMany batch on the
// second one, so collapse them here first, keeping the first occurrence.
function dedupeRows(rows) {
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const row of rows) {
    if (seen.has(row.externalId)) {
      dropped += 1;
      continue;
    }
    seen.add(row.externalId);
    kept.push(row);
  }
  return { rows: kept, dropped };
}

// Validates a whole request body. Returns either { error } for something
// that should 400 the entire request, or { source, fileName, rows,
// skipped } where `skipped` counts per reason.
function validateImportRequest(body, { now = new Date(), earliestAllowed } = {}) {
  if (!body || typeof body !== 'object') return { error: 'A request body is required.' };

  const { source, fileName, runs } = body;

  if (!IMPORT_SOURCES.has(source)) {
    return { error: `source must be one of: ${[...IMPORT_SOURCES].join(', ')}` };
  }
  if (!Array.isArray(runs)) return { error: 'runs must be an array.' };
  if (runs.length === 0) return { error: 'runs must contain at least one activity.' };
  if (runs.length > MAX_ROWS_PER_REQUEST) {
    return { error: `runs may contain at most ${MAX_ROWS_PER_REQUEST} activities per request.` };
  }

  const skipped = {};
  const valid = [];
  for (const raw of runs) {
    const result = validateImportRow(raw, { now, earliestAllowed });
    if (result.ok) valid.push(result.row);
    else skipped[result.reason] = (skipped[result.reason] || 0) + 1;
  }

  const { rows, dropped } = dedupeRows(valid);
  if (dropped > 0) skipped.duplicateInFile = dropped;

  return {
    source,
    fileName:
      typeof fileName === 'string' && fileName.trim()
        ? fileName.trim().slice(0, MAX_FILE_NAME_LEN)
        : null,
    rows,
    skipped,
    parsed: runs.length,
  };
}

module.exports = {
  IMPORT_SOURCES,
  IMPORTABLE_TYPES,
  MAX_ROWS_PER_REQUEST,
  validateImportRow,
  validateImportRequest,
  dedupeRows,
};
