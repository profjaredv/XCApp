// T4 (Team Management handoff): applies a coach-confirmed meet mapping
// produced by scripts/proposeMeetMapping.js. Only processes entries whose
// "decision" field is exactly "confirmed" — "pending" and "rejected"
// entries (and anything else) are skipped and reported. This is the only
// code path allowed to create Meet rows or set Race.meetId from existing
// data; nothing merges meets on name similarity, per the handoff doc.
//
// Run from backend/: node scripts/applyMeetMapping.js --in <path-to-reviewed-file.json>
// Add --dry-run to see what would happen without writing anything.

const fs = require('fs');
const path = require('path');
const prisma = require('../lib/db');

async function main() {
  const inArgIndex = process.argv.indexOf('--in');
  if (inArgIndex === -1 || !process.argv[inArgIndex + 1]) {
    console.error('Usage: node scripts/applyMeetMapping.js --in <path-to-reviewed-file.json> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const inPath = path.resolve(process.argv[inArgIndex + 1]);
  const dryRun = process.argv.includes('--dry-run');

  const file = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const meetEntries = Array.isArray(file.meets) ? file.meets : [];

  const confirmed = meetEntries.filter((m) => m.decision === 'confirmed');
  const rejected = meetEntries.filter((m) => m.decision === 'rejected');
  const pending = meetEntries.filter((m) => m.decision !== 'confirmed' && m.decision !== 'rejected');

  console.log(`Meet entries in file: ${meetEntries.length}`);
  console.log(`  confirmed: ${confirmed.length}`);
  console.log(`  rejected:  ${rejected.length}`);
  console.log(`  pending (not yet decided — skipped): ${pending.length}`);

  if (confirmed.length === 0) {
    console.log('\nNothing confirmed. Nothing to apply.');
    return;
  }

  const missingSeason = confirmed.filter((m) => !m.seasonId);
  if (missingSeason.length > 0) {
    console.error(
      `\n${missingSeason.length} confirmed entries have no seasonId (see "noSeason" in the proposal) — ` +
        'create the Season row first, then re-run the propose script.'
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would apply the following (no writes performed) —');
    for (const m of confirmed) {
      console.log(`  "${m.confirmedName}" on ${m.date} <- ${m.raceIds.length} races`);
    }
    return;
  }

  const results = await prisma.$transaction(async (tx) => {
    const applied = [];
    for (const entry of confirmed) {
      if (!entry.confirmedName || !entry.confirmedName.trim()) {
        throw new Error(`Confirmed entry missing confirmedName (date=${entry.date}, teamId=${entry.teamId})`);
      }

      const meet = await tx.meet.create({
        data: {
          teamId: entry.teamId,
          seasonId: entry.seasonId,
          name: entry.confirmedName.trim(),
          date: new Date(entry.date),
          location: entry.location || null,
        },
      });

      const raceIds = entry.raceIds || [];
      const updateResult = await tx.race.updateMany({
        where: { id: { in: raceIds }, meetId: null },
        data: { meetId: meet.id },
      });

      applied.push({
        meetId: meet.id,
        name: meet.name,
        date: entry.date,
        requestedRaceCount: raceIds.length,
        updatedRaceCount: updateResult.count,
      });
    }
    return applied;
  });

  console.log('\nApplied:');
  for (const r of results) {
    const note =
      r.updatedRaceCount !== r.requestedRaceCount
        ? `  (WARNING: requested ${r.requestedRaceCount}, only ${r.updatedRaceCount} races found/updated — some race IDs may be stale or already grouped)`
        : '';
    console.log(`  "${r.name}" (${r.meetId}) on ${r.date}: ${r.updatedRaceCount} races linked${note}`);
  }
}

main()
  .catch((err) => {
    console.error('Failed to apply meet mapping:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
