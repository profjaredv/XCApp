// Guards on the training-log import endpoint's validation layer.
//
// The browser parses the file and posts summary rows (a .fit is binary, an
// Apple Health export is hundreds of megabytes, express.json is capped at
// 1mb), so nothing here can assume the payload is well-formed just because
// our own code built it. These tests pin the rules that keep a bad parse,
// a stale clock or a replayed request from becoming wrong mileage in front
// of a coach.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateImportRow,
  validateImportRequest,
  dedupeRows,
  IMPORTABLE_TYPES,
  IMPORT_SOURCES,
} = require('../lib/trainingLogImport');

const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'athletes.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(__dirname, '..', 'prisma', 'migrations', '20260831000000_training_log_import', 'migration.sql'),
  'utf8'
);

const NOW = new Date('2026-08-31T12:00:00.000Z');
const EARLIEST = new Date('2021-08-31T00:00:00.000Z');

function goodRow(over = {}) {
  return {
    externalId: 'gpx:2026-08-30T13:02:11Z',
    date: '2026-08-30',
    startedAt: '2026-08-30T13:02:11.000Z',
    type: 'easy',
    distanceMi: 6.2,
    durationSec: 2760,
    ...over,
  };
}

const opts = { now: NOW, earliestAllowed: EARLIEST };

test('a well-formed row passes and normalizes', () => {
  const result = validateImportRow(goodRow(), opts);
  assert.equal(result.ok, true);
  assert.equal(result.row.distanceMi, 6.2);
  assert.equal(result.row.durationSec, 2760);
  assert.equal(result.row.date.toISOString(), '2026-08-30T00:00:00.000Z');
  assert.equal(result.row.startedAt.toISOString(), '2026-08-30T13:02:11.000Z');
});

test('import can never produce a race, interval or tempo log', () => {
  // Races live in Result and drive PRs, season bests and analytics. A
  // heuristic promoting a hard run to `race` here would corrupt all of it.
  // interval/tempo are coach vocabulary a file cannot know.
  for (const forbidden of ['race', 'interval', 'tempo']) {
    assert.equal(IMPORTABLE_TYPES.has(forbidden), false, `${forbidden} must not be importable`);
    const result = validateImportRow(goodRow({ type: forbidden }), opts);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'badType');
  }
  assert.deepEqual([...IMPORTABLE_TYPES].sort(), ['easy', 'long', 'other']);
});

test('a file can never claim to be hand-entered or coach-recorded', () => {
  // Accepting these would let an import masquerade as a manual log and
  // erase the provenance the whole feature exists to record.
  assert.equal(IMPORT_SOURCES.has('manual'), false);
  assert.equal(IMPORT_SOURCES.has('interval_session'), false);
  const result = validateImportRequest({ source: 'manual', runs: [goodRow()] }, opts);
  assert.match(result.error, /source must be one of/);
});

test('a row with neither distance nor duration is refused, not zero-filled', () => {
  const result = validateImportRow(
    goodRow({ distanceMi: null, durationSec: null }),
    opts
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
});

test('a future run is refused — that is a clock bug, not a workout', () => {
  const result = validateImportRow(
    goodRow({ date: '2026-09-05', startedAt: '2026-09-05T13:00:00.000Z' }),
    opts
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'future');
});

test('a run one day ahead is allowed — the athlete may be east of the server', () => {
  const result = validateImportRow(
    goodRow({ date: '2026-08-31', startedAt: '2026-08-31T22:00:00.000Z' }),
    opts
  );
  assert.equal(result.ok, true);
});

test('an archive older than the window is refused', () => {
  const result = validateImportRow(
    goodRow({ date: '2015-05-05', startedAt: '2015-05-05T13:00:00.000Z' }),
    opts
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tooOld');
});

test('date and startedAt must describe the same run', () => {
  // 36 hours of slack covers every real timezone offset; a week apart is a
  // parser that paired the wrong fields.
  const result = validateImportRow(
    goodRow({ date: '2026-08-30', startedAt: '2026-08-20T13:00:00.000Z' }),
    opts
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'dateMismatch');
});

test('a local calendar day one timezone-shift from the instant is kept', () => {
  // 2026-08-30 06:02 in Denver is 2026-08-30T12:02Z. The athlete's local
  // day is the 30th and must survive — deriving the day server-side is
  // exactly the bug this pair of fields prevents.
  const result = validateImportRow(
    goodRow({ date: '2026-08-30', startedAt: '2026-08-30T12:02:00.000Z' }),
    opts
  );
  assert.equal(result.ok, true);
  assert.equal(result.row.date.toISOString(), '2026-08-30T00:00:00.000Z');
});

test('a late-evening run whose UTC instant lands on the next day is kept', () => {
  // 2026-08-30 21:30 in Denver is 2026-08-31T03:30Z — a real, common case.
  const result = validateImportRow(
    goodRow({ date: '2026-08-30', startedAt: '2026-08-31T03:30:00.000Z' }),
    opts
  );
  assert.equal(result.ok, true);
});

test('implausible distances and durations are refused', () => {
  assert.equal(validateImportRow(goodRow({ distanceMi: 500 }), opts).reason, 'outOfRange');
  assert.equal(validateImportRow(goodRow({ durationSec: 5 }), opts).reason, 'outOfRange');
  assert.equal(validateImportRow(goodRow({ durationSec: 200000 }), opts).reason, 'outOfRange');
});

test('a bad heart rate drops the field rather than the run', () => {
  const result = validateImportRow(goodRow({ avgHrBpm: 900 }), opts);
  assert.equal(result.ok, true, 'the mileage is still real');
  assert.equal(result.row.avgHrBpm, null);
});

test('a row without an external id is refused — it could never dedupe', () => {
  assert.equal(validateImportRow(goodRow({ externalId: '' }), opts).reason, 'noExternalId');
  assert.equal(validateImportRow(goodRow({ externalId: undefined }), opts).reason, 'noExternalId');
});

test('duplicate ids inside one file collapse instead of failing the batch', () => {
  // Strava archives have shipped the same activity twice. The database
  // unique index would reject the whole createMany, so this must be caught
  // before it gets there.
  const { rows, dropped } = dedupeRows([
    { externalId: 'a' },
    { externalId: 'b' },
    { externalId: 'a' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(dropped, 1);
});

test('a request reports why each row was skipped, not just how many', () => {
  const result = validateImportRequest(
    {
      source: 'strava_export',
      fileName: 'export.zip',
      runs: [
        goodRow(),
        goodRow({ externalId: 'dup' }),
        goodRow({ externalId: 'dup' }),
        goodRow({ externalId: 'x1', type: 'race' }),
        goodRow({ externalId: 'x2', distanceMi: null, durationSec: null }),
      ],
    },
    opts
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.parsed, 5);
  assert.equal(result.skipped.badType, 1);
  assert.equal(result.skipped.empty, 1);
  assert.equal(result.skipped.duplicateInFile, 1);
});

test('an oversized batch is refused so the 1mb body limit is never the error', () => {
  const runs = Array.from({ length: 501 }, (_, i) => goodRow({ externalId: `r${i}` }));
  const result = validateImportRequest({ source: 'file_gpx', runs }, opts);
  assert.match(result.error, /at most 500/);
});

test('the import route is athlete-scoped and has no coach counterpart', () => {
  // TrainingLog is "yours alone" by schema comment. A coach importing an
  // athlete's health data would invert that posture entirely.
  assert.match(
    ROUTES,
    /router\.post\(\s*'\/me\/training-logs\/import',\s*authenticate,\s*requireLinkedAthlete/,
    'import must be self-scoped'
  );
  assert.doesNotMatch(
    ROUTES,
    /training-logs\/import[\s\S]{0,120}requireRole/,
    'no coach-role import route may exist'
  );
});

test('imported logs are not force-shared — the athlete decides', () => {
  assert.match(ROUTES, /sharedWithCoach = Boolean\(req\.body\.sharedWithCoach\)/);
  assert.doesNotMatch(ROUTES, /sharedWithCoach:\s*true/, 'never hardcode sharing on');
});

test('re-import is idempotent by construction', () => {
  assert.match(ROUTES, /skipDuplicates:\s*true/);
  assert.match(SCHEMA, /@@unique\(\[athleteId, source, externalId\]\)/);
  assert.match(MIGRATION, /CREATE UNIQUE INDEX "training_logs_athlete_id_source_external_id_key"/);
});

test('undo deletes only the requesting athlete rows', () => {
  assert.match(
    ROUTES,
    /deleteMany\(\{\s*where:\s*\{\s*importBatchId: batch\.id,\s*athleteId\s*\}/,
    'the delete must be scoped by athleteId, not batch id alone'
  );
});

test('the migration relabels coach-recorded rows instead of calling them manual', () => {
  assert.match(
    MIGRATION,
    /UPDATE "training_logs"[\s\S]*'interval_session'[\s\S]*source_interval_session_entry_id" IS NOT NULL/,
    'existing coach-written logs must not be backfilled as manual'
  );
});
