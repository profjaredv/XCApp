// T4 (Team Management handoff): propose grouping existing Race rows into
// Meet parents without ever auto-merging. One signal only: races on the
// same date for the same team's same season almost never belong to two
// different meets — a team can't be at two events at once — so grouping
// is an EXACT (teamId, seasonId, date) match, the same "normalize, don't
// fuzzy-match" posture as Course mapping (Build Spec Phase 2 step 2;
// lib/courseMapping.js). Race names typically differ by level/gender
// within one meet ("Foo Invite - Boys Varsity" vs "Foo Invite - Girls
// JV"), so a shared name stem — not any single race's raw name — is
// proposed as the meet name; a coach confirms or edits it either way.

const LEVEL_GENDER_SUFFIX = /\s*[-–—]\s*(boys?|girls?)\s*(varsity|jv|junior varsity|frosh|freshman)?\s*$/i;

function stripLevelGenderSuffix(name) {
  return name.replace(LEVEL_GENDER_SUFFIX, '').trim();
}

function mostCommon(strings) {
  const counts = new Map();
  for (const s of strings) counts.set(s, (counts.get(s) || 0) + 1);
  let best = strings[0];
  let bestCount = 0;
  for (const [s, count] of counts) {
    if (count > bestCount) {
      best = s;
      bestCount = count;
    }
  }
  return best;
}

// races: [{ id, teamId, seasonId, name, date, location }]
// date may be a Date or an ISO-ish string; only the calendar day is used.
function buildMeetMappingProposal({ races }) {
  const noSeason = [];
  const groupsByKey = new Map();

  for (const race of races) {
    if (!race.seasonId) {
      noSeason.push({ id: race.id, teamId: race.teamId, name: race.name, date: race.date });
      continue;
    }
    const dateKey = race.date instanceof Date ? race.date.toISOString().slice(0, 10) : String(race.date).slice(0, 10);
    const key = `${race.teamId}:${race.seasonId}:${dateKey}`;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, { teamId: race.teamId, seasonId: race.seasonId, date: dateKey, races: [] });
    }
    groupsByKey.get(key).races.push(race);
  }

  const meets = [...groupsByKey.values()]
    .map((group) => {
      const stems = group.races.map((r) => stripLevelGenderSuffix(r.name)).filter((s) => s.length > 0);
      const proposedName = stems.length > 0 ? mostCommon(stems) : mostCommon(group.races.map((r) => r.name));
      const locations = group.races.map((r) => r.location).filter(Boolean);
      return {
        teamId: group.teamId,
        seasonId: group.seasonId,
        date: group.date,
        proposedName,
        location: locations.length > 0 ? mostCommon(locations) : null,
        raceIds: group.races.map((r) => r.id),
        raceNames: group.races.map((r) => r.name),
        raceCount: group.races.length,
      };
    })
    .sort((a, b) => b.raceCount - a.raceCount);

  return { meets, noSeason };
}

module.exports = { stripLevelGenderSuffix, buildMeetMappingProposal };
