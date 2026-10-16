#!/usr/bin/env node
// Clears the athlete name and grade on every stored FieldResult row that is
// not one of the team's own athletes (paste-in data spec §3.2). School,
// time, place, gender, division and status are kept, so field statistics and
// team scoring are unchanged.
//
// Destructive and not reversible: the names are gone afterwards. So:
//   - the default is a DRY RUN that only reports counts;
//   - --apply refuses to run unless --confirm-backup is also given, which
//     is the operator saying a database backup exists.
//
//   node scripts/anonymizeFieldResults.js                      (report only)
//   node scripts/anonymizeFieldResults.js --apply --confirm-backup
//
// Run after the 20261017000000_field_results_names_optional migration.

const prisma = require('../lib/db');
const { teamNameSet, isTeamRow } = require('../lib/fieldAnonymize');

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-backup');
  if (apply && !confirmed) {
    console.error('Refusing to apply: this clears stored names and cannot be undone. Take a database backup, then re-run with --apply --confirm-backup.');
    process.exit(2);
  }

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  let total = 0;
  let cleared = 0;
  let kept = 0;

  for (const team of teams) {
    const athletes = await prisma.athlete.findMany({ where: { teamId: team.id }, select: { name: true, preferredName: true } });
    const names = teamNameSet(athletes);
    const rows = await prisma.fieldResult.findMany({
      where: { race: { teamId: team.id }, OR: [{ athleteName: { not: null } }, { grade: { not: null } }] },
      select: { id: true, athleteName: true },
    });
    const toClear = rows.filter((r) => !isTeamRow(r, names)).map((r) => r.id);
    total += rows.length;
    kept += rows.length - toClear.length;
    cleared += toClear.length;
    if (apply) {
      for (let i = 0; i < toClear.length; i += 1000) {
        await prisma.fieldResult.updateMany({ where: { id: { in: toClear.slice(i, i + 1000) } }, data: { athleteName: null, grade: null } });
      }
    }
    if (rows.length) console.log(`${team.name}: ${toClear.length} to clear, ${rows.length - toClear.length} own athletes kept`);
  }

  console.log(`\n${apply ? 'Cleared' : 'Would clear'} ${cleared} rows; ${kept} own-athlete rows kept; ${total} rows with a name or grade examined.`);
  if (!apply) console.log('Dry run: nothing was changed.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
