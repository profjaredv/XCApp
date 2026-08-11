// T4 (Team Management handoff): "Group existing races into meets by date
// plus name similarity, write the proposal to a review file, and have a
// coach confirm before applying. Do not auto-merge." Same
// propose/coach-confirms/apply shape as Course mapping (Build Spec Phase
// 2 step 2) — see scripts/proposeCourseMapping.js for the precedent this
// follows.
//
// Read-only against the database — writes nothing except the review file.
// Only considers races that don't already have a meetId, so re-running
// after an apply never re-proposes already-grouped races.
//
// Run from backend/: node scripts/proposeMeetMapping.js [--out <path>]
// Then hand-edit the output file: for each meet entry, set "decision" to
// "confirmed" or "rejected", and correct "confirmedName"/"location" if
// the proposed values are wrong. Entries left "pending" are skipped by
// scripts/applyMeetMapping.js — nothing is applied automatically.

const fs = require('fs');
const path = require('path');
const prisma = require('../lib/db');
const { buildMeetMappingProposal } = require('../lib/meetMapping');

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outPath =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? path.resolve(process.argv[outArgIndex + 1])
      : path.join(__dirname, 'meet-mapping-proposal.json');

  const races = await prisma.race.findMany({
    where: { meetId: null },
    select: { id: true, teamId: true, name: true, date: true, location: true, season: true },
  });

  // Race carries a plain `season` year (Int), not a seasonId foreign key —
  // resolve each race's Season row by (teamId, year) so a proposed Meet can
  // set a real seasonId. Races whose year has no Season row yet land in
  // "noSeason" rather than being grouped against a guess.
  const seasonRows = await prisma.season.findMany({ select: { id: true, teamId: true, year: true } });
  const seasonIdByTeamYear = new Map(seasonRows.map((s) => [`${s.teamId}:${s.year}`, s.id]));

  const racesWithSeasonId = races.map((r) => ({
    ...r,
    seasonId: seasonIdByTeamYear.get(`${r.teamId}:${r.season}`) || null,
  }));

  const { meets, noSeason } = buildMeetMappingProposal({ races: racesWithSeasonId });

  const output = {
    _instructions:
      'For each entry in "meets", set "decision" to "confirmed" or "rejected". ' +
      'Edit "confirmedName"/"location" if the proposed values are wrong. Races are ' +
      'grouped only by an exact (team, season, date) match, never fuzzy — a team ' +
      'cannot be at two different meets on the same day. "noSeason" races have no ' +
      'matching Season row for their year and cannot be grouped until one exists. ' +
      'Entries left "pending" are skipped by scripts/applyMeetMapping.js.',
    generatedAt: new Date().toISOString(),
    meets: meets.map((m) => ({
      decision: 'pending', // coach sets to "confirmed" or "rejected"
      proposedName: m.proposedName,
      confirmedName: m.proposedName,
      location: m.location,
      teamId: m.teamId,
      seasonId: m.seasonId,
      date: m.date,
      raceNames: m.raceNames,
      raceCount: m.raceCount,
      raceIds: m.raceIds,
    })),
    noSeason,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log(`Races considered (no meetId yet): ${races.length}`);
  console.log(`Proposed meets:                   ${meets.length}`);
  console.log(`No matching season (skipped):     ${noSeason.length}`);
  console.log(`\nWrote review file: ${outPath}`);
  console.log('Nothing was written to the database. Review and edit the file, then run:');
  console.log(`  node scripts/applyMeetMapping.js --in ${path.relative(process.cwd(), outPath)}`);
}

main()
  .catch((err) => {
    console.error('Failed to generate meet mapping proposal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
