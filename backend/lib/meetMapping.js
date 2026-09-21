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
// race is linked to a real Meet, or is simply absent/null when it isn't.
// `hasSplitsRaceIds` is the existing per-race splits Set.
//
// A Race.meetId only exists after a coach runs Schedule > Meets >
// Import, so keying on it alone meant every scraped season read as one
// card PER RACE: a meet where the team ran two distances showed up
// twice, same name, same date, side by side, which is exactly what a
// coach reports as "it's listed twice." Unlinked rows therefore fall
// back to the same signal buildMeetMappingProposal above proposes a
// Meet from — same calendar day, same name stem — because a team
// cannot be at two events at once. This is display grouping, not a
// merge: no Meet row is created, nothing is written, and the heats
// stay individually addressable below.
function unlinkedMeetKey(row) {
  const name = (row.meetName || '').trim();
  if (!name || !row.meetDate) return `race:${row.raceId}`;
  const dateKey =
    row.meetDate instanceof Date ? row.meetDate.toISOString().slice(0, 10) : String(row.meetDate).slice(0, 10);
  return `day:${stripLevelGenderSuffix(name).toLowerCase()}|${dateKey}`;
}

function groupMeetMetricsByMeet(rows, meetInfoByRaceId, hasSplitsRaceIds) {
  const groups = new Map();
  for (const row of rows) {
    const info = meetInfoByRaceId.get(row.raceId) || null;
    const key = info ? `meet:${info.id}` : unlinkedMeetKey(row);
    if (!groups.has(key)) groups.set(key, { info, rows: [] });
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map(({ info, rows: groupRows }) => {
      const totalRunners = groupRows.reduce((sum, r) => sum + (r.participantCount || 0), 0);
      // Weighted by field size, not a naive average of averages — a
      // 60-runner varsity heat and a 10-runner JV heat don't deserve
      // equal weight in "this meet's average pace." Pace per mile is
      // comparable across distances, so this stays meaningful even for
      // a meet whose heats ran different distances.
      const weightedPaceSum = groupRows.reduce((sum, r) => sum + (r.averagePace || 0) * (r.participantCount || 0), 0);
      const avgPace = totalRunners > 0 ? weightedPaceSum / totalRunners : groupRows[0].averagePace || 0;
      const first = groupRows[0];
      // One distance for the whole entry ONLY when every heat ran it.
      // Reporting the first heat's distance for a mixed-distance meet
      // labels a 3200m heat as a 5K — a confident wrong number.
      const distances = groupRows.map((r) => r.distance).filter((d) => d != null);
      const sharedDistance =
        distances.length === groupRows.length && distances.every((d) => d === distances[0]) ? distances[0] : null;
      // An unlinked group's heats are usually named identically (the
      // season scraper names every race after its meet), but a coach's
      // own races differ by level/gender — the shared stem is the meet.
      const stems = groupRows
        .map((r) => stripLevelGenderSuffix(r.meetName || ''))
        .filter((s) => s.length > 0);
      let name = first.meetName;
      if (info) name = info.name;
      else if (groupRows.length > 1 && stems.length > 0) name = mostCommon(stems);
      return {
        id: info ? info.id : first.raceId,
        name,
        date: first.meetDate,
        location: (info && info.location) || '',
        distance: sharedDistance,
        avgPace,
        runners: totalRunners,
        hasSplits: groupRows.some((r) => hasSplitsRaceIds.has(r.raceId)),
        // Only present when this entry is actually multiple heats — a
        // single race (grouped or not) stays exactly the shape it always
        // was, so nothing downstream has to special-case "one heat."
        // Each heat carries its own distance so the UI can offer the
        // distances as toggles rather than pooling incomparable races.
        heats:
          groupRows.length > 1
            ? groupRows.map((r) => ({
                id: r.raceId,
                name: r.meetName,
                distance: r.distance ?? null,
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
// A column is one meet AT ONE DISTANCE.
//
// Heats of the same distance merge: they are the same race run in waves,
// the times are directly comparable, and a coach wants them as one column.
// Different distances at the same meet do NOT merge — a 5K and a 3200m are
// not one result, and pooling them put two incomparable times in a single
// cell where one silently overwrote the other.
//
// That case is not exotic. The season scraper names every race after its
// MEET (Athletic.net's season grid has no per-heat name — only a distance
// subscript per cell), so "our team ran two distances at this meet" is
// represented as two races sharing a name and date, differing only by
// distance. Grouping on meet alone collapsed exactly the thing that
// distinguishes them.
//
// `meetKey` lets a caller re-group columns under one meet heading and show
// the distances as toggles beneath it, which is only worth doing when a
// meet actually has more than one.
function groupRacesIntoColumns(races) {
  const columns = [];
  const indexByKey = new Map();
  for (const race of races) {
    const meetKey = race.meetId ? `meet:${race.meetId}` : `race:${race.id}`;
    const distanceKey = race.distanceMeters != null ? String(Math.round(race.distanceMeters)) : 'unknown';
    const key = `${meetKey}|${distanceKey}`;
    let index = indexByKey.get(key);
    if (index == null) {
      index = columns.length;
      indexByKey.set(key, index);
      columns.push({
        name: race.meetId ? race.meetName : race.name,
        meetKey,
        distanceMeters: race.distanceMeters ?? null,
        raceIds: [race.id],
      });
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
  unlinkedMeetKey,
  groupRacesIntoColumns,
};
