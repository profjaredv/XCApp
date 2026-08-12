// Phase 1, build spec step 5: "Add a migration that backfills
// distanceMeters for every existing race and reports how many could not be
// parsed."
//
// A one-off script rather than a SQL migration because it needs to run the
// real parser (backend/lib/distance.js) per row, not something expressible
// as a single SQL statement. Safe to re-run — it only writes a race whose
// freshly-parsed value differs from what's already stored, and reports
// every race it could not parse (by id) for manual review rather than
// guessing.
//
// Run from backend/: node scripts/backfillDistanceMeters.js
// Add --dry-run to see the report without writing anything.

const prisma = require('../lib/db');
const { parseDistanceToMeters } = require('../lib/distance');
const calculationService = require('../services/performance/calculationService');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const races = await prisma.race.findMany({
    select: { id: true, teamId: true, season: true, name: true, date: true, distance: true, distanceMeters: true },
  });

  console.log(`Checking ${races.length} races${dryRun ? ' (dry run, no writes)' : ''}...`);

  let unchanged = 0;
  let updated = 0;
  const unparseable = [];
  // distanceMeters feeds pace math directly in calculationService
  // (getAthleteRacesSeasonOnly, calculateMeetPerformance) — every
  // team+season whose races this backfill actually changes needs its
  // cached metrics recomputed, or their pace/mileage figures stay wrong
  // until the next unrelated re-scrape happens to trigger a recalc.
  const affectedTeamSeasons = new Map(); // teamId -> Set(season)

  for (const race of races) {
    const parsed = parseDistanceToMeters(race.distance);

    if (parsed === null) {
      unparseable.push(race);
      continue;
    }

    const alreadyCorrect =
      race.distanceMeters !== null && Math.abs(race.distanceMeters - parsed) < 0.01;

    if (alreadyCorrect) {
      unchanged++;
      continue;
    }

    if (!dryRun) {
      await prisma.race.update({ where: { id: race.id }, data: { distanceMeters: parsed } });
      if (!affectedTeamSeasons.has(race.teamId)) affectedTeamSeasons.set(race.teamId, new Set());
      affectedTeamSeasons.get(race.teamId).add(race.season);
    }
    updated++;
    console.log(
      `  ${dryRun ? 'would update' : 'updated'}: "${race.distance}" -> ${parsed}m ` +
        `(was ${race.distanceMeters ?? 'null'}) [${race.name}, ${race.date.toISOString().slice(0, 10)}]`
    );
  }

  console.log('\n--- Summary ---');
  console.log(`Total races:        ${races.length}`);
  console.log(`Already correct:    ${unchanged}`);
  console.log(`${dryRun ? 'Would update' : 'Updated'}:  ${'   '.slice(0, 12 - (dryRun ? 12 : 9))}${updated}`);
  console.log(`Could not parse:    ${unparseable.length}`);

  if (unparseable.length > 0) {
    console.log('\nNeeds manual review — distanceMeters left untouched for these:');
    for (const r of unparseable) {
      console.log(`  id=${r.id} teamId=${r.teamId} distance=${JSON.stringify(r.distance)} name=${r.name} date=${r.date.toISOString().slice(0, 10)}`);
    }
  }

  const pairCount = [...affectedTeamSeasons.values()].reduce((sum, seasons) => sum + seasons.size, 0);
  if (pairCount > 0) {
    console.log(`\nRecalculating metrics for ${pairCount} affected team+season pair(s)...`);
    for (const [teamId, seasons] of affectedTeamSeasons) {
      for (const season of seasons) {
        try {
          await calculationService.calculateAllMetrics(teamId, season);
        } catch (calcError) {
          console.error(`  Failed to recalculate metrics for team ${teamId}, season ${season}: ${calcError.message}`);
        }
      }
    }
    console.log('Done recalculating.');
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
