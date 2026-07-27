// Phase 2 step 2 (XCApp Build Spec): "Write a migration that groups existing
// races by normalized location string and by MeetGroup membership, proposes
// a course mapping, and writes it to a review file. A coach confirms the
// mapping before it is applied. Do not auto-merge courses on string
// similarity."
//
// Read-only against the database — writes nothing except the review file.
// Course is deliberately NOT team-scoped (two teams at the same venue share
// one Course), so this proposes across every team's races, not just one.
//
// Run from backend/: node scripts/proposeCourseMapping.js [--out <path>]
// Then hand-edit the output file: for each course entry, set "decision" to
// "confirmed" or "rejected", and correct "confirmedName"/"city"/"state" if
// the proposed name is wrong. Entries left "pending" are skipped by
// scripts/applyCourseMapping.js — nothing is applied automatically.

const fs = require('fs');
const path = require('path');
const prisma = require('../lib/db');
const { buildCourseMappingProposal } = require('../lib/courseMapping');

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outPath =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? path.resolve(process.argv[outArgIndex + 1])
      : path.join(__dirname, 'course-mapping-proposal.json');

  const races = await prisma.race.findMany({
    select: { id: true, teamId: true, name: true, location: true, date: true, season: true },
  });

  const meetGroupRaces = await prisma.meetGroupRace.findMany({
    select: { raceId: true, meetGroup: { select: { id: true, groupName: true, teamId: true } } },
  });
  const meetGroupMemberships = meetGroupRaces.map((mgr) => ({
    meetGroupId: mgr.meetGroup.id,
    groupName: mgr.meetGroup.groupName,
    teamId: mgr.meetGroup.teamId,
    raceId: mgr.raceId,
  }));

  const { courses, meetGroupConflicts, unmapped } = buildCourseMappingProposal({
    races,
    meetGroupMemberships,
  });

  const output = {
    _instructions:
      'For each entry in "courses", set "decision" to "confirmed" or "rejected". ' +
      'Edit "confirmedName"/"city"/"state" if the proposed name is wrong or you want ' +
      'to add city/state (never invented here — Athletic.net location text doesn\'t ' +
      'reliably carry them). Review "meetGroupConflicts": each one links races whose ' +
      'location text differs, so no course was proposed to merge them automatically — ' +
      'decide by hand whether they are really the same venue. "unmapped" races have no ' +
      'location text at all and cannot be mapped to a course from this data. ' +
      'Entries left "pending" are skipped by scripts/applyCourseMapping.js.',
    generatedAt: new Date().toISOString(),
    courses: courses.map((c) => ({
      decision: 'pending', // coach sets to "confirmed" or "rejected"
      proposedName: c.proposedName,
      confirmedName: c.proposedName,
      city: null,
      state: null,
      normalizedKey: c.normalizedKey,
      rawLocations: c.rawLocations,
      raceCount: c.raceCount,
      raceIds: c.raceIds,
    })),
    meetGroupConflicts,
    unmapped,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log(`Races considered:        ${races.length}`);
  console.log(`Proposed courses:        ${courses.length}`);
  console.log(`MeetGroup conflicts:     ${meetGroupConflicts.length} (need manual review, see file)`);
  console.log(`Unmapped (no location):  ${unmapped.length}`);
  console.log(`\nWrote review file: ${outPath}`);
  console.log('Nothing was written to the database. Review and edit the file, then run:');
  console.log(`  node scripts/applyCourseMapping.js --in ${path.relative(process.cwd(), outPath)}`);
}

main()
  .catch((err) => {
    console.error('Failed to generate course mapping proposal:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
