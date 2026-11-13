// Imports a track Event Progress CSV (produced by web/src/lib/
// trackEventProgressPaste.ts from a page the coach copied out of their own
// browser — see that file's header for why a server-side scraper can't
// reach this page itself). Mirrors routes/teams.js's importSeasonCsv in
// shape (upsert by a natural key, athlete matching via lib/athleteMatching.js)
// but is its own function: track's natural keys, units and event catalog
// are all genuinely different from XC's, not a copy of the same bug.
//
// A paste never deletes anything — rows it doesn't mention are left alone,
// same rule the XC import follows.
const { parse } = require('csv-parse/sync');
const moment = require('moment');
const prisma = require('./db');
const { matchAthlete, normalizeAthleteName, athleticIdKey } = require('./athleteMatching');
const { normalizeGender } = require('./gender');
const { deriveGraduationYear } = require('./season');
const { buildEventMatcher } = require('./trackEventCatalog');
const { parseMark } = require('./trackMarks');
const { parseRound } = require('./trackRound');

const DATE_FORMATS = ['M/D/YY', 'M/D/YYYY', 'MM/DD/YY', 'MM/DD/YYYY'];

async function importEventProgressCsv(team, yearNum, csvData) {
  const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });

  const [events, existingAthletes, aliasRows, existingMeets] = await Promise.all([
    prisma.event.findMany(),
    prisma.athlete.findMany({ where: { teamId: team.id } }),
    prisma.athleteAliasId.findMany({ where: { teamId: team.id } }),
    prisma.trackMeet.findMany({ where: { teamId: team.id, season: yearNum } }),
  ]);
  const matchEventName = buildEventMatcher(events);

  const athleteByAthleticId = new Map(
    existingAthletes.filter((a) => a.athleticAthleteId).map((a) => [athleticIdKey(a.athleticAthleteId), a])
  );
  const athleteByName = new Map(existingAthletes.map((a) => [normalizeAthleteName(a.name), a]));
  const athleteById = new Map(existingAthletes.map((a) => [a.id, a]));
  const athleteByAliasId = new Map(
    aliasRows.filter((r) => athleteById.has(r.athleteId)).map((r) => [athleticIdKey(r.athleticAthleteId), athleteById.get(r.athleteId)])
  );

  // TrackMeet's natural key is (teamId, name, date) — pre-fetching this
  // season's meets and matching by hand avoids one upsert round-trip per
  // CSV row (a season typically repeats the same handful of meet names
  // across every event and athlete).
  const meetByKey = new Map(existingMeets.map((m) => [`${m.name}|${m.date.toISOString().slice(0, 10)}`, m]));

  // The track season itself, and who is on it. Roster, groups, schedule and
  // photos for track all hang off this row, so importing results is enough
  // to make the season exist for them.
  const seasonRow = await prisma.season.upsert({
    where: { teamId_year_sport: { teamId: team.id, year: yearNum, sport: 'TRACK' } },
    update: {},
    create: { teamId: team.id, year: yearNum, sport: 'TRACK' },
  });
  const rostered = new Map();

  let recordsProcessed = 0;
  let skippedMissing = 0;
  let skippedDate = 0;
  const unmatchedEvents = new Set();

  for (const row of records) {
    const athleteName = row['Athlete Name'];
    const eventName = row.Event;
    const dateRaw = row.Date;
    const meetName = row['Meet Name'];
    const result = row.Result;

    if (!athleteName || !eventName || !dateRaw || !meetName) {
      skippedMissing++;
      continue;
    }

    const parsedDate = moment(dateRaw, DATE_FORMATS, true);
    if (!parsedDate.isValid()) {
      skippedDate++;
      continue;
    }

    const { event, matched } = matchEventName(eventName);
    if (!matched) {
      unmatchedEvents.add(eventName);
      continue;
    }

    const grade = row.Grade ? parseInt(row.Grade, 10) : null;
    // Outdoor track is the spring of a school year: an 11th grader in the
    // 2026 track season graduates in 2027. Athletes are shared with cross
    // country, so this must agree with what XC derives.
    const graduationYear = grade ? deriveGraduationYear(grade, yearNum, 'TRACK') : null;
    const genderValue = normalizeGender(row.Gender);
    const athleticAthleteIdValue = row['Athletic Athlete ID'] || null;

    const existingMatch = matchAthlete(
      { athleticAthleteId: athleticIdKey(athleticAthleteIdValue), name: athleteName },
      { byAthleticId: athleteByAthleticId, byAliasId: athleteByAliasId, byName: athleteByName }
    );

    let athlete;
    if (existingMatch) {
      const changes = {
        ...(genderValue && existingMatch.gender !== genderValue ? { gender: genderValue } : {}),
        // Fill a missing graduation year; never overwrite one cross
        // country (or the coach) already set.
        ...(graduationYear !== null && existingMatch.graduationYear == null ? { graduationYear } : {}),
        ...(athleticAthleteIdValue && !existingMatch.athleticAthleteId ? { athleticAthleteId: athleticAthleteIdValue } : {}),
      };
      // One CSV row per result means the same athlete recurs dozens of
      // times; only write when something actually changes.
      athlete = Object.keys(changes).length
        ? await prisma.athlete.update({ where: { id: existingMatch.id }, data: changes })
        : existingMatch;
    } else {
      athlete = await prisma.athlete.create({
        data: { name: athleteName, teamId: team.id, gender: genderValue, graduationYear, athleticAthleteId: athleticAthleteIdValue },
      });
    }
    if (athlete.athleticAthleteId) athleteByAthleticId.set(athleticIdKey(athlete.athleticAthleteId), athlete);
    athleteByName.set(normalizeAthleteName(athlete.name), athlete);

    if (!rostered.has(athlete.id) || (rostered.get(athlete.id) == null && grade != null)) rostered.set(athlete.id, grade);

    const meetDate = parsedDate.startOf('day').toDate();
    const meetKey = `${meetName}|${meetDate.toISOString().slice(0, 10)}`;
    let meet = meetByKey.get(meetKey);
    if (!meet) {
      meet = await prisma.trackMeet.create({
        data: {
          teamId: team.id,
          name: meetName,
          date: meetDate,
          season: yearNum,
          sourceUrl: row['Meet URL'] || null,
          athleticMeetId: row['Athletic Meet ID'] || null,
        },
      });
      meetByKey.set(meetKey, meet);
    }

    const { markValue, status } = parseMark(result, event.unit);
    const windValue = row.Wind ? parseFloat(row.Wind) : null;
    const placeValue = row.Place ? parseInt(row.Place, 10) : null;
    const round = parseRound(row.Round);

    await prisma.trackResult.upsert({
      where: {
        teamId_trackMeetId_eventId_athleteId_round: {
          teamId: team.id,
          trackMeetId: meet.id,
          eventId: event.id,
          athleteId: athlete.id,
          round,
        },
      },
      update: {
        gender: genderValue,
        grade,
        markValue,
        wind: Number.isFinite(windValue) ? windValue : null,
        place: Number.isFinite(placeValue) ? placeValue : null,
        status,
      },
      create: {
        teamId: team.id,
        trackMeetId: meet.id,
        eventId: event.id,
        athleteId: athlete.id,
        gender: genderValue,
        grade,
        round,
        markValue,
        wind: Number.isFinite(windValue) ? windValue : null,
        place: Number.isFinite(placeValue) ? placeValue : null,
        status,
      },
    });

    recordsProcessed++;
  }

  // Add anyone who competed to the season's roster. Never deactivates or
  // removes: a coach who took someone off stays in charge of that.
  const existingRoster = await prisma.seasonRoster.findMany({ where: { seasonId: seasonRow.id }, select: { athleteId: true } });
  const onRoster = new Set(existingRoster.map((r) => r.athleteId));
  const toAdd = [...rostered].filter(([athleteId]) => !onRoster.has(athleteId));
  if (toAdd.length) {
    await prisma.seasonRoster.createMany({
      data: toAdd.map(([athleteId, g]) => ({ seasonId: seasonRow.id, athleteId, grade: g, isActive: true })),
      skipDuplicates: true,
    });
  }

  return { recordsProcessed, skippedMissing, skippedDate, unmatchedEvents: [...unmatchedEvents], rosterAdded: toAdd.length };
}

module.exports = { importEventProgressCsv };
