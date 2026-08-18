// Workstream C, Section C2 (LeadPack Master Build Handoff) — the data
// hazard that must be resolved before any splits migration runs.
//
// The owner states RaceSplit values are recorded cumulative from the gun.
// But web/src/components/analytics/RaceSplitsModal.tsx computes a two-mile
// time as mile1 + mile2, which only makes sense if those are segment times —
// so either the auto-calculate button has been writing wrong values, or rows
// were entered under both conventions at different times. A migration
// written against the wrong assumption is unrecoverable, so this script
// reads the real data and reports what convention (or mix of conventions)
// is actually in the table. It writes nothing.
//
// For every RaceSplit joined to its Result and Race, this computes
// mile2 / mile1 and buckets the row:
//   cumulative-signal              ratio near 2.0  (e.g. 5:30, 11:10 -> 2.03)
//   segment-signal                 ratio near 1.0  (e.g. 5:30, 5:40  -> 1.03)
//   impossible-under-cumulative    ratio < 1.0 — cumulative mile2 can never
//                                   be less than cumulative mile1, so this is
//                                   only possible if these are segment times
//   ambiguous                      ratio doesn't clearly land in either band
//                                   above, or mile1 is 0/null so the ratio
//                                   can't be computed at all
//
// It also flags, independently of the bucket above:
//   - rows where mile3 is populated on a race under 4800m (a 5K's third mile
//     marker would be meaningless on a shorter course — signals bad data
//     regardless of convention)
//   - rows where any of mile1/mile2/mile3 is exactly 0 — routes/splits.js:75
//     calls parseFloat(split.mile1) and the frontend's parseTimeInput('')
//     returns 0, so a blank entry and a real 0:00 split are stored
//     identically today. The eventual migration converts stored 0 to null;
//     this count is how large that conversion will be.
//
// Run from backend/: node scripts/auditSplitConvention.js
//
// Per the handoff doc: "Print the summary and stop. Do not migrate. Report
// and wait for confirmation." This script only ever reads. Nothing in
// Workstream C beyond this point (schema changes, the real migration,
// lib/splitMath.js, the entry grid) should be written until the owner has
// seen this output and confirmed which convention the data is actually in.

const prisma = require('../lib/db');

const CUMULATIVE_RATIO_MIN = 1.7;
const CUMULATIVE_RATIO_MAX = 2.3;
const SEGMENT_RATIO_MIN = 1.0;
const SEGMENT_RATIO_MAX = 1.3;
const SHORT_RACE_METERS = 4800;
const MAX_EXAMPLES = 10;

function classify(mile1, mile2) {
  if (mile1 === null || mile2 === null || mile1 === 0) return 'ambiguous';
  const ratio = mile2 / mile1;
  if (ratio < 1.0) return 'impossible-under-cumulative';
  if (ratio >= CUMULATIVE_RATIO_MIN && ratio <= CUMULATIVE_RATIO_MAX) return 'cumulative-signal';
  if (ratio >= SEGMENT_RATIO_MIN && ratio <= SEGMENT_RATIO_MAX) return 'segment-signal';
  return 'ambiguous';
}

function hasZero(row) {
  return row.mile1 === 0 || row.mile2 === 0 || row.mile3 === 0;
}

function fmtSplit(v) {
  return v === null || v === undefined ? 'null' : v;
}

async function main() {
  const rows = await prisma.raceSplit.findMany({
    select: {
      id: true,
      mile1: true,
      mile2: true,
      mile3: true,
      athlete: { select: { name: true } },
      race: { select: { name: true, distance: true, distanceMeters: true } },
    },
  });

  const buckets = {
    'cumulative-signal': [],
    'segment-signal': [],
    'impossible-under-cumulative': [],
    ambiguous: [],
  };

  let zeroValueCount = 0;
  let mile3OnShortRaceCount = 0;
  let mile3UnknownDistanceCount = 0;

  for (const row of rows) {
    const bucket = classify(row.mile1, row.mile2);
    buckets[bucket].push(row);

    if (hasZero(row)) zeroValueCount++;

    if (row.mile3 !== null) {
      if (row.race.distanceMeters === null) {
        mile3UnknownDistanceCount++;
      } else if (row.race.distanceMeters < SHORT_RACE_METERS) {
        mile3OnShortRaceCount++;
      }
    }
  }

  console.log('=== Split convention audit ===\n');
  console.log(`Total RaceSplit rows: ${rows.length}\n`);

  console.log('By ratio bucket (mile2 / mile1):');
  for (const [name, list] of Object.entries(buckets)) {
    const pct = rows.length > 0 ? ((list.length / rows.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${name.padEnd(28)} ${String(list.length).padStart(6)}  (${pct}%)`);
  }
  console.log();

  console.log(`Rows with any value exactly 0 (blank-entered under the current bug): ${zeroValueCount}`);
  console.log(`Rows with mile3 populated on a race under ${SHORT_RACE_METERS}m: ${mile3OnShortRaceCount}`);
  if (mile3UnknownDistanceCount > 0) {
    console.log(`Rows with mile3 populated but race.distanceMeters is null (can't check): ${mile3UnknownDistanceCount}`);
  }
  console.log();

  console.log(`--- ${MAX_EXAMPLES} examples (spread across buckets) ---`);
  const examples = [];
  const order = ['cumulative-signal', 'segment-signal', 'impossible-under-cumulative', 'ambiguous'];
  let round = 0;
  while (examples.length < MAX_EXAMPLES && order.some((b) => buckets[b].length > round)) {
    for (const bucketName of order) {
      if (examples.length >= MAX_EXAMPLES) break;
      const row = buckets[bucketName][round];
      if (row) examples.push({ ...row, bucket: bucketName });
    }
    round++;
  }

  for (const ex of examples) {
    console.log(
      `  [${ex.bucket}] ${ex.athlete.name} — ${ex.race.name} (${ex.race.distance ?? 'distance unknown'}, ` +
        `${ex.race.distanceMeters ?? '?'}m): mile1=${fmtSplit(ex.mile1)} mile2=${fmtSplit(ex.mile2)} mile3=${fmtSplit(ex.mile3)}`
    );
  }

  console.log('\n=== Print the summary and stop. Do not migrate. Report and wait for confirmation. ===');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Audit failed:', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

// Exported for backend/test/auditSplitConvention.test.js — the classification
// arithmetic is exactly the kind of thing the handoff doc says needs a test
// written before it's trusted, and it's pure (no DB) so it's cheap to cover.
module.exports = { classify, hasZero, CUMULATIVE_RATIO_MIN, CUMULATIVE_RATIO_MAX, SEGMENT_RATIO_MIN, SEGMENT_RATIO_MAX };
