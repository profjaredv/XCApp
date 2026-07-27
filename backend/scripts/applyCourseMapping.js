// Phase 2 step 2 (XCApp Build Spec): applies a coach-confirmed course
// mapping produced by scripts/proposeCourseMapping.js. Only processes
// entries whose "decision" field is exactly "confirmed" — "pending" and
// "rejected" entries (and anything else) are skipped and reported. This is
// the only code path allowed to create Course rows or set Race.courseId;
// nothing merges courses on string similarity, per the Build Spec.
//
// Run from backend/: node scripts/applyCourseMapping.js --in <path-to-reviewed-file.json>
// Add --dry-run to see what would happen without writing anything.

const fs = require('fs');
const path = require('path');
const prisma = require('../lib/db');

async function main() {
  const inArgIndex = process.argv.indexOf('--in');
  if (inArgIndex === -1 || !process.argv[inArgIndex + 1]) {
    console.error('Usage: node scripts/applyCourseMapping.js --in <path-to-reviewed-file.json> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const inPath = path.resolve(process.argv[inArgIndex + 1]);
  const dryRun = process.argv.includes('--dry-run');

  const file = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const courseEntries = Array.isArray(file.courses) ? file.courses : [];

  const confirmed = courseEntries.filter((c) => c.decision === 'confirmed');
  const rejected = courseEntries.filter((c) => c.decision === 'rejected');
  const pending = courseEntries.filter((c) => c.decision !== 'confirmed' && c.decision !== 'rejected');

  console.log(`Course entries in file: ${courseEntries.length}`);
  console.log(`  confirmed: ${confirmed.length}`);
  console.log(`  rejected:  ${rejected.length}`);
  console.log(`  pending (not yet decided — skipped): ${pending.length}`);

  if (confirmed.length === 0) {
    console.log('\nNothing confirmed. Nothing to apply.');
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would apply the following (no writes performed) —');
    for (const c of confirmed) {
      console.log(`  "${c.confirmedName}" (${c.city || 'no city'}, ${c.state || 'no state'}) <- ${c.raceIds.length} races`);
    }
    return;
  }

  const results = await prisma.$transaction(async (tx) => {
    const applied = [];
    for (const entry of confirmed) {
      if (!entry.confirmedName || !entry.confirmedName.trim()) {
        throw new Error(`Confirmed entry missing confirmedName (normalizedKey=${entry.normalizedKey})`);
      }

      const course = await tx.course.upsert({
        where: {
          name_city_state: {
            name: entry.confirmedName.trim(),
            city: entry.city || null,
            state: entry.state || null,
          },
        },
        update: {},
        create: {
          name: entry.confirmedName.trim(),
          city: entry.city || null,
          state: entry.state || null,
        },
      });

      const raceIds = entry.raceIds || [];
      const updateResult = await tx.race.updateMany({
        where: { id: { in: raceIds } },
        data: { courseId: course.id },
      });

      applied.push({
        courseId: course.id,
        name: course.name,
        requestedRaceCount: raceIds.length,
        updatedRaceCount: updateResult.count,
      });
    }
    return applied;
  });

  console.log('\nApplied:');
  for (const r of results) {
    const note = r.updatedRaceCount !== r.requestedRaceCount
      ? `  (WARNING: requested ${r.requestedRaceCount}, only ${r.updatedRaceCount} races found/updated — some race IDs may be stale)`
      : '';
    console.log(`  "${r.name}" (${r.courseId}): ${r.updatedRaceCount} races linked${note}`);
  }
}

main()
  .catch((err) => {
    console.error('Failed to apply course mapping:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
