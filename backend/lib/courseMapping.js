// Phase 2 step 2 (XCApp Build Spec): propose a Course grouping for existing
// races without ever auto-merging on string similarity. Two signals only:
//   1. Exact match after normalizing Race.location (trim/collapse-space/
//      case-fold) — this is normalization, not fuzzy matching.
//   2. Races a coach already linked into the same MeetGroup across seasons.
//      If those races carry *different* normalized locations, that is
//      surfaced as a conflict for the coach to resolve, never merged
//      silently — a MeetGroup name is a human judgment call, not proof.
// Races with no location text at all are listed separately; nothing is
// invented for them.

function normalizeLocation(location) {
  if (!location) return null;
  const trimmed = location.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
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

// races: [{ id, teamId, name, location, date, season }]
// meetGroupMemberships: [{ meetGroupId, groupName, teamId, raceId }]
function buildCourseMappingProposal({ races, meetGroupMemberships }) {
  const unmapped = [];
  const groupsByKey = new Map();

  for (const race of races) {
    const key = normalizeLocation(race.location);
    if (!key) {
      unmapped.push(race);
      continue;
    }
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, { normalizedKey: key, races: [], rawLocations: new Set() });
    }
    const group = groupsByKey.get(key);
    group.races.push(race);
    group.rawLocations.add(race.location.trim());
  }

  const raceIdToKey = new Map();
  for (const group of groupsByKey.values()) {
    for (const race of group.races) raceIdToKey.set(race.id, group.normalizedKey);
  }

  const meetGroupsById = new Map();
  for (const m of meetGroupMemberships) {
    if (!meetGroupsById.has(m.meetGroupId)) {
      meetGroupsById.set(m.meetGroupId, { meetGroupId: m.meetGroupId, groupName: m.groupName, teamId: m.teamId, raceIds: [] });
    }
    meetGroupsById.get(m.meetGroupId).raceIds.push(m.raceId);
  }

  const meetGroupConflicts = [];
  for (const info of meetGroupsById.values()) {
    const keysInGroup = new Set();
    for (const raceId of info.raceIds) {
      const key = raceIdToKey.get(raceId);
      if (key) keysInGroup.add(key);
    }
    if (keysInGroup.size > 1) {
      meetGroupConflicts.push({
        meetGroupId: info.meetGroupId,
        groupName: info.groupName,
        teamId: info.teamId,
        locationKeys: [...keysInGroup],
      });
    }
  }

  const courses = [...groupsByKey.values()]
    .map((group) => ({
      normalizedKey: group.normalizedKey,
      proposedName: mostCommon(group.races.map((r) => r.location.trim())),
      rawLocations: [...group.rawLocations],
      raceIds: group.races.map((r) => r.id),
      raceCount: group.races.length,
    }))
    .sort((a, b) => b.raceCount - a.raceCount);

  return {
    courses,
    meetGroupConflicts,
    unmapped: unmapped.map((r) => ({ id: r.id, teamId: r.teamId, name: r.name, date: r.date })),
  };
}

module.exports = { normalizeLocation, buildCourseMappingProposal };
