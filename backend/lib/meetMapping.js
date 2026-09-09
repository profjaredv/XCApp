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

// A re-scrape (routes/teams.js POST /scrape) deletes and recreates every
// non-manual race for the season from scratch — Athletic.net gives no
// stable "this is still the same race" id beyond name+date+distance, the
// same fields the (teamId, name, date, distance) unique index already
// keys on. Used to carry a race's existing meetId across that delete/
// recreate cycle, so re-scraping a season doesn't silently un-group a
// multi-heat meet a coach already confirmed with the Import flow above.
function raceIdentityKey(name, date, distance) {
  const dateKey = date instanceof Date ? date.toISOString() : String(date);
  return `${name}|${dateKey}|${distance}`;
}

// GET /analytics/overview's Season > Meets list — this is display
// grouping only (the list a coach scans), never touching the per-race
// analytics underneath (IQR bands, scoring, splits) which stay per-heat
// on purpose: mixing "Boys Varsity" and "Girls JV" times from the same
// meet day into one blob would be a wrong number, not a convenience.
// `rows` is [{raceId, meetName, meetDate, distance, averagePace,
// participantCount}] (MeetPerformanceMetrics, one per race);
// `meetInfoByRaceId` maps a raceId to {id, name, location} when that
// race is linked to a real Meet, or is simply absent/null when it isn't
// (an unlinked scraped race, or one from before a coach ran Import) —
// those races keep showing as their own single-race entry, unchanged.
// `hasSplitsRaceIds` is the existing per-race splits Set.
function groupMeetMetricsByMeet(rows, meetInfoByRaceId, hasSplitsRaceIds) {
  const groups = new Map();
  for (const row of rows) {
    const info = meetInfoByRaceId.get(row.raceId) || null;
    const key = info ? `meet:${info.id}` : `race:${row.raceId}`;
    if (!groups.has(key)) groups.set(key, { info, rows: [] });
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map(({ info, rows: groupRows }) => {
      const totalRunners = groupRows.reduce((sum, r) => sum + (r.participantCount || 0), 0);
      // Weighted by field size, not a naive average of averages — a
      // 60-runner varsity heat and a 10-runner JV heat don't deserve
      // equal weight in "this meet's average pace."
      const weightedPaceSum = groupRows.reduce((sum, r) => sum + (r.averagePace || 0) * (r.participantCount || 0), 0);
      const avgPace = totalRunners > 0 ? weightedPaceSum / totalRunners : groupRows[0].averagePace || 0;
      const first = groupRows[0];
      return {
        id: info ? info.id : first.raceId,
        name: info ? info.name : first.meetName,
        date: first.meetDate,
        location: (info && info.location) || '',
        distance: first.distance || 5000,
        avgPace,
        runners: totalRunners,
        hasSplits: groupRows.some((r) => hasSplitsRaceIds.has(r.raceId)),
        // Only present when this entry is actually multiple heats — a
        // single race (grouped or not) stays exactly the shape it always
        // was, so nothing downstream has to special-case "one heat."
        heats:
          groupRows.length > 1
            ? groupRows.map((r) => ({
                id: r.raceId,
                name: r.meetName,
                runners: r.participantCount || 0,
                avgPace: r.averagePace || 0,
                hasSplits: hasSplitsRaceIds.has(r.raceId),
              }))
            : undefined,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// GET /teams/results-grid — one column per meet instead of one per race,
// so a multi-heat meet (several races sharing a Meet, via Race.meetId)
// shows as a single combined column instead of one per heat: an athlete
// only ever runs one heat of a given meet, so whichever heat has their
// time is that meet's value for them (see the caller, which looks a
// result up by whichever raceId in a column actually has one). `races`
// is [{id, name, meetId, meetName}], already ordered the way columns
// should read left to right (by date); a race with no Meet link (never
// run through Import) keeps its own column, unchanged.
function groupRacesIntoColumns(races) {
  const columns = [];
  const indexByKey = new Map();
  for (const race of races) {
    const key = race.meetId ? `meet:${race.meetId}` : `race:${race.id}`;
    let index = indexByKey.get(key);
    if (index == null) {
      index = columns.length;
      indexByKey.set(key, index);
      columns.push({ name: race.meetId ? race.meetName : race.name, raceIds: [race.id] });
    } else {
      columns[index].raceIds.push(race.id);
    }
  }
  return columns;
}

module.exports = {
  stripLevelGenderSuffix,
  buildMeetMappingProposal,
  raceIdentityKey,
  groupMeetMetricsByMeet,
  groupRacesIntoColumns,
};
