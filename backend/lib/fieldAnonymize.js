// Other schools' athletes are never stored by name (paste-in data spec §3.1).
//
// A field-results paste carries every finisher in the division, but LeadPack
// only needs names for OUR athletes (placement matches a Result to its field
// row by name). Every other row keeps what field statistics and team scoring
// need — time, place, gender, division, status and the SCHOOL, which is what
// team standings group by — and loses the athlete's name and grade.
//
// "Ours" means the row's name matches any athlete on this team's roster (not
// only those with a Result on this race), so an athlete whose Result is
// entered after the field was pasted still matches.
//
// Pure functions, no Prisma.

const { normalizeAthleteName, athleteNameCandidates } = require('./athleteMatching');

function teamNameSet(teamAthletes) {
  const names = new Set();
  for (const a of teamAthletes || []) {
    for (const n of athleteNameCandidates(a.name, a.preferredName)) names.add(n);
  }
  return names;
}

/** True when this field row's athlete is on the team (by any name the roster knows them by). */
function isTeamRow(row, names) {
  const n = normalizeAthleteName(row && row.athleteName);
  return !!n && names.has(n);
}

/**
 * rows: parsed field rows ({ athleteName, schoolName, grade, ... }).
 * Returns { rows, kept, dropped } — rows with athleteName/grade nulled for
 * everyone who is not on the team.
 */
function anonymizeFieldRows(rows, teamAthletes) {
  const names = teamNameSet(teamAthletes);
  let kept = 0;
  const out = (rows || []).map((r) => {
    if (isTeamRow(r, names)) {
      kept += 1;
      return r;
    }
    return { ...r, athleteName: null, grade: null };
  });
  return { rows: out, kept, dropped: out.length - kept };
}

module.exports = { teamNameSet, isTeamRow, anonymizeFieldRows };
