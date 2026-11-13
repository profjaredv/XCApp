// Track & Field (docs/leadpack-track-field-handoff.md).
//
// Who can reach this: the team's own coaches. Reads take any coach
// (ANY_COACH); the import, which writes results and can create athletes,
// takes a full coach (FULL_COACH) — the same split the XC results routes
// use. On top of the role, two more gates sit on every route:
//
//   requireFeature('track')  a team that has turned Track & Field off in
//                            Settings gets neither the screen nor the API.
//   requireTrackSport        TeamMember.sport (handoff Section 1b): a staff
//                            member scoped to "XC" gets nothing here; null
//                            (everyone today) means every sport.
//
// Everything is scoped to req.user.teamId from the session, never to
// anything in the URL or body.
const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireRole, hasTeamRole } = require('../middleware/auth');
const { requireFeature } = require('../middleware/teamFeatures');
const { FULL_COACH, ANY_COACH, DESTRUCTIVE } = require('../lib/teamRoles');
const { normalizeGender } = require('../lib/gender');
const { parseMark } = require('../lib/trackMarks');
const { decideCanAccessSportScopedResource } = require('../lib/groupPermissions');
const { checkEventProgressCsv } = require('../lib/trackEventProgressCsv');
const { importEventProgressCsv } = require('../lib/trackEventProgressImport');
const {
  seasonLeaders,
  pointsContribution,
  athleteProgression,
  parseScoringTable,
  programByEvent,
  relayLegEventName,
  suggestRelay,
  meetSheet,
  prsAtMeet,
  DEFAULT_SCORING_TABLE,
} = require('../lib/trackAnalytics');

async function requireTrackSport(req, res, next) {
  try {
    const user = req.user;
    if (user?.isSuperAdmin && user?.isImpersonating) return next();
    const isOwner = Boolean(user?.team && user.team.coachUid === user.id);
    const membership = isOwner
      ? null
      : await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: user.teamId, userId: user.id } } });
    if (decideCanAccessSportScopedResource({ isOwner, membership, resourceSport: 'TRACK' })) return next();
    return res.status(403).json({ message: 'Your staff access does not include Track & Field.' });
  } catch (err) {
    console.error('Error checking track sport scope:', err.message);
    return res.status(500).json({ message: 'An unexpected error occurred.' });
  }
}

const normalizeGenderParam = (g) => (g === 'M' || g === 'F' ? g : null);

// One flat row per result, the shape lib/trackAnalytics.js takes.
const RESULT_SELECT = {
  id: true,
  eventId: true,
  athleteId: true,
  gender: true,
  grade: true,
  round: true,
  markValue: true,
  wind: true,
  place: true,
  status: true,
  relayAthleteIds: true,
  relayTeam: true,
  athlete: { select: { id: true, name: true } },
  trackMeet: { select: { id: true, name: true, date: true, season: true } },
};
const flatten = (r) => ({
  id: r.id,
  eventId: r.eventId,
  athleteId: r.athleteId,
  athleteName: r.athlete ? r.athlete.name : null,
  gender: r.gender,
  grade: r.grade,
  round: r.round,
  markValue: r.markValue,
  wind: r.wind,
  place: r.place,
  status: r.status,
  relayAthleteIds: r.relayAthleteIds,
  relayTeam: r.relayTeam,
  meetId: r.trackMeet.id,
  meetName: r.trackMeet.name,
  date: r.trackMeet.date,
  season: r.trackMeet.season,
});

// GET /api/track/events — the event catalog, in display order.
router.get('/events', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    res.json(await prisma.event.findMany({ orderBy: { sortOrder: 'asc' } }));
  } catch (err) {
    console.error('Error fetching track events:', err.message);
    res.status(500).json({ message: 'Could not load the event catalog.' });
  }
});

// GET /api/track/seasons — every season this team has track results for,
// newest first, with live counts. A track season exists because results
// were imported for it; there is nothing to set up first.
router.get('/seasons', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meets = await prisma.trackMeet.findMany({
      where: { teamId: req.user.teamId },
      select: { season: true, _count: { select: { results: true } } },
    });
    const bySeason = new Map();
    for (const m of meets) {
      const s = bySeason.get(m.season) || { year: m.season, meetCount: 0, resultCount: 0 };
      s.meetCount += 1;
      s.resultCount += m._count.results;
      bySeason.set(m.season, s);
    }
    res.json([...bySeason.values()].sort((a, b) => b.year - a.year));
  } catch (err) {
    console.error('Error fetching track seasons:', err.message);
    res.status(500).json({ message: 'Could not load track seasons.' });
  }
});

// GET /api/track/seasons/:year/meets — the season's meets, oldest first.
router.get('/seasons/:year/meets', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meets = await prisma.trackMeet.findMany({
      where: { teamId: req.user.teamId, season: parseInt(req.params.year, 10) || 0 },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true, sourceUrl: true, _count: { select: { results: true } } },
    });
    res.json(meets.map((m) => ({ id: m.id, name: m.name, date: m.date, sourceUrl: m.sourceUrl, resultCount: m._count.results })));
  } catch (err) {
    console.error('Error fetching track meets:', err.message);
    res.status(500).json({ message: 'Could not load meets.' });
  }
});

// GET /api/track/seasons/:year/leaders?gender=M|F — per event, each
// athlete's season best, ranked.
router.get('/seasons/:year/leaders', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const gender = normalizeGenderParam(req.query.gender);
    const [events, results] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackResult.findMany({
        where: {
          teamId: req.user.teamId,
          trackMeet: { season: parseInt(req.params.year, 10) || 0 },
          ...(gender ? { gender } : {}),
        },
        select: RESULT_SELECT,
      }),
    ]);
    const rows = results.map(flatten);
    // Relays have no single athlete, so they are listed as squads: every
    // relay time this season, fastest first, with who ran it.
    const relayEvents = events.filter((e) => e.isRelay).sort((a, b) => a.sortOrder - b.sortOrder);
    const names = await athleteNames(req.user.teamId, rows);
    const relays = relayEvents
      .map((event) => ({
        event,
        leaders: [],
        relays: rows
          .filter((r) => r.eventId === event.id && r.status === 'FINISHED' && r.markValue != null)
          .sort((a, b) => a.markValue - b.markValue)
          .map((r) => withLegs(r, names)),
      }))
      .filter((e) => e.relays.length);
    res.json([...seasonLeaders(rows, events).map((e) => ({ ...e, relays: [] })), ...relays].sort((a, b) => a.event.sortOrder - b.event.sortOrder));
  } catch (err) {
    console.error('Error fetching track leaders:', err.message);
    res.status(500).json({ message: 'Could not load event leaders.' });
  }
});

// GET /api/track/points?gender=M|F&table=10,8,6,5,4,3,2,1 — points by
// event across every imported season. The table is an assumption the coach
// can change, and is echoed back so the screen can say which one was used.
router.get('/points', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const gender = normalizeGenderParam(req.query.gender);
    const table = parseScoringTable(req.query.table) || DEFAULT_SCORING_TABLE;
    const [events, results] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackResult.findMany({
        where: { teamId: req.user.teamId, ...(gender ? { gender } : {}) },
        select: RESULT_SELECT,
      }),
    ]);
    res.json({ table, ...pointsContribution(results.map(flatten), events, table) });
  } catch (err) {
    console.error('Error fetching track points:', err.message);
    res.status(500).json({ message: 'Could not load points by event.' });
  }
});

// GET /api/track/program?gender=M|F — every individual event season over
// season: best mark, depth, how many athletes, how much they improved in
// season, and how returners compare with the year before.
router.get('/program', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const gender = normalizeGenderParam(req.query.gender);
    const [events, results] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackResult.findMany({ where: { teamId: req.user.teamId, athleteId: { not: null }, ...(gender ? { gender } : {}) }, select: RESULT_SELECT }),
    ]);
    res.json(programByEvent(results.map(flatten), events));
  } catch (err) {
    console.error('Error fetching track program:', err.message);
    res.status(500).json({ message: 'Could not load the program view.' });
  }
});

// GET /api/track/athletes/:athleteId — one athlete's marks by event, with
// PRs flagged. The athlete must be on the caller's team.
router.get('/athletes/:athleteId', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
      select: { id: true, name: true, gender: true, graduationYear: true },
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found.' });
    res.json(await loadTrackAthlete(req.user.teamId, athlete));
  } catch (err) {
    console.error('Error fetching track athlete:', err.message);
    res.status(500).json({ message: 'Could not load that athlete.' });
  }
});


// Names for the athletes a set of relay rows mention, in one query.
async function athleteNames(teamId, rows) {
  const ids = [...new Set(rows.flatMap((r) => r.relayAthleteIds || []))];
  if (!ids.length) return new Map();
  const athletes = await prisma.athlete.findMany({ where: { teamId, id: { in: ids } }, select: { id: true, name: true } });
  return new Map(athletes.map((a) => [a.id, a.name]));
}
const withLegs = (row, names) => ({ ...row, legs: (row.relayAthleteIds || []).map((id) => ({ athleteId: id, name: names.get(id) || 'Unknown' })) });

// Every relay an athlete ran a leg of, newest first. A relay belongs to the
// team, so it is found through relayAthleteIds, never athleteId.
async function loadRelaysFor(teamId, athleteId, events) {
  const rows = (await prisma.trackResult.findMany({ where: { teamId, relayAthleteIds: { has: athleteId } }, select: RESULT_SELECT })).map(flatten);
  const names = await athleteNames(teamId, rows);
  const eventById = new Map(events.map((e) => [e.id, e]));
  return rows
    .map((r) => ({ ...withLegs(r, names), event: eventById.get(r.eventId), leg: r.relayAthleteIds.indexOf(athleteId) + 1 }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// One athlete's whole track record: marks by event with PRs flagged, and
// every relay they ran a leg of.
async function loadTrackAthlete(teamId, athlete) {
  const [events, results] = await Promise.all([
    prisma.event.findMany(),
    prisma.trackResult.findMany({ where: { teamId, athleteId: athlete.id, status: { not: 'ENTERED' } }, select: RESULT_SELECT }),
  ]);
  const relays = await loadRelaysFor(teamId, athlete.id, events);
  return { athlete, events: athleteProgression(results.map(flatten), events), relays };
}

const findMeet = (req) => prisma.trackMeet.findFirst({ where: { id: req.params.meetId, teamId: req.user.teamId } });
const parseDay = (value) => {
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// GET /api/track/seasons/:year/summary — the Track home screen: what is
// coming up, what just happened, and the season so far.
router.get('/seasons/:year/summary', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10) || 0;
    const teamId = req.user.teamId;
    const [events, meets, all, season] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackMeet.findMany({ where: { teamId, season: year }, orderBy: { date: 'asc' }, select: { id: true, name: true, date: true, location: true, notes: true } }),
      prisma.trackResult.findMany({ where: { teamId }, select: RESULT_SELECT }),
      prisma.season.findFirst({ where: { teamId, year, sport: 'TRACK' }, select: { id: true } }),
    ]);
    const rows = all.map(flatten);
    const seasonRows = rows.filter((r) => r.season === year);
    const competed = new Set(seasonRows.filter((r) => r.status !== 'ENTERED').map((r) => r.meetId));
    const today = new Date(new Date().toISOString().slice(0, 10));
    const upcoming = meets.filter((m) => m.date >= today && !competed.has(m.id));
    const lastMeet = [...meets].reverse().find((m) => competed.has(m.id)) || null;
    const rosterCount = season ? await prisma.seasonRoster.count({ where: { seasonId: season.id, isActive: true } }) : 0;
    const prs = lastMeet ? prsAtMeet(rows, events, lastMeet.id) : [];
    const leaders = seasonLeaders(seasonRows, events);
    res.json({
      year,
      rosterCount,
      meetCount: competed.size,
      resultCount: seasonRows.filter((r) => r.status !== 'ENTERED').length,
      eventCount: leaders.length,
      upcoming,
      lastMeet,
      lastMeetPrs: prs.map((p) => ({ id: p.id, athleteId: p.athleteId, athleteName: p.athleteName, markValue: p.markValue, previous: p.previous, event: p.event })),
    });
  } catch (err) {
    console.error('Error fetching track summary:', err.message);
    res.status(500).json({ message: 'Could not load the season summary.' });
  }
});

// POST /api/track/meets { name, date, season, location?, notes? } — a meet
// the coach is planning, before any results exist.
router.post('/meets', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const { name, location, notes } = req.body || {};
    const date = parseDay(req.body?.date);
    const season = parseInt(req.body?.season, 10);
    if (!name || !String(name).trim() || !date || !Number.isFinite(season)) {
      return res.status(400).json({ message: 'A meet needs a name, a date and a season.' });
    }
    const teamId = req.user.teamId;
    const existing = await prisma.trackMeet.findFirst({ where: { teamId, name: String(name).trim(), date } });
    if (existing) return res.status(409).json({ message: 'That meet is already on the schedule.', id: existing.id });
    await prisma.season.upsert({
      where: { teamId_year_sport: { teamId, year: season, sport: 'TRACK' } },
      update: {},
      create: { teamId, year: season, sport: 'TRACK' },
    });
    const meet = await prisma.trackMeet.create({
      data: { teamId, name: String(name).trim(), date, season, location: location || null, notes: notes || null },
    });
    res.status(201).json(meet);
  } catch (err) {
    console.error('Error creating track meet:', err.message);
    res.status(500).json({ message: 'Could not add that meet.' });
  }
});

// PUT /api/track/meets/:meetId { location?, notes? } — the plan for the
// day. Name and date are left alone: they are how a re-import finds the meet.
router.put('/meets/:meetId', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meet = await findMeet(req);
    if (!meet) return res.status(404).json({ message: 'Meet not found.' });
    const data = {};
    if ('location' in (req.body || {})) data.location = req.body.location || null;
    if ('notes' in (req.body || {})) data.notes = req.body.notes || null;
    res.json(await prisma.trackMeet.update({ where: { id: meet.id }, data }));
  } catch (err) {
    console.error('Error updating track meet:', err.message);
    res.status(500).json({ message: 'Could not save that meet.' });
  }
});

// DELETE /api/track/meets/:meetId — only a meet with no results: this is
// for a planned meet that was cancelled (routine scheduling, so any full
// coach), never a way to throw results away.
router.delete('/meets/:meetId', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meet = await findMeet(req);
    if (!meet) return res.status(404).json({ message: 'Meet not found.' });
    const real = await prisma.trackResult.count({ where: { trackMeetId: meet.id, status: { not: 'ENTERED' } } });
    if (real > 0) return res.status(409).json({ message: 'This meet has results, so it cannot be removed.' });
    await prisma.trackMeet.delete({ where: { id: meet.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting track meet:', err.message);
    res.status(500).json({ message: 'Could not remove that meet.' });
  }
});

// GET /api/track/meets/:meetId — one meet: entries and results by event,
// relays with their legs, and the PRs set there.
router.get('/meets/:meetId', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meet = await findMeet(req);
    if (!meet) return res.status(404).json({ message: 'Meet not found.' });
    const [events, all] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackResult.findMany({ where: { teamId: req.user.teamId }, select: RESULT_SELECT }),
    ]);
    const rows = all.map(flatten);
    const here = rows.filter((r) => r.meetId === meet.id);
    const names = await athleteNames(req.user.teamId, here);
    const prIds = new Set(prsAtMeet(rows, events, meet.id).map((p) => p.id));
    res.json({
      meet,
      hasResults: here.some((r) => r.status !== 'ENTERED'),
      events: meetSheet(here, events).map(({ event, rows: eventRows }) => ({
        event,
        rows: eventRows.map((r) => ({ ...withLegs(r, names), isPr: prIds.has(r.id) })),
      })),
    });
  } catch (err) {
    console.error('Error fetching track meet:', err.message);
    res.status(500).json({ message: 'Could not load that meet.' });
  }
});

// PUT /api/track/meets/:meetId/entries { eventId, athleteIds } — who is
// entered in one event. Sets the whole list for that event: adds the new,
// drops the removed. An athlete who already has a real result there is
// never touched; entries are only ever the rows still waiting on a mark.
router.put('/meets/:meetId/entries', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meet = await findMeet(req);
    if (!meet) return res.status(404).json({ message: 'Meet not found.' });
    const teamId = req.user.teamId;
    const event = await prisma.event.findUnique({ where: { id: String(req.body?.eventId || '') } }).catch(() => null);
    if (!event || event.isRelay) return res.status(400).json({ message: 'Pick an individual event. Relays are built as squads.' });
    const wanted = [...new Set(Array.isArray(req.body?.athleteIds) ? req.body.athleteIds : [])];
    const athletes = await prisma.athlete.findMany({ where: { teamId, id: { in: wanted } }, select: { id: true, gender: true } });
    if (athletes.length !== wanted.length) return res.status(400).json({ message: 'One or more athletes are not on this team.' });

    const existing = await prisma.trackResult.findMany({ where: { teamId, trackMeetId: meet.id, eventId: event.id, athleteId: { not: null } } });
    const have = new Map(existing.map((r) => [r.athleteId, r]));
    const toRemove = existing.filter((r) => r.status === 'ENTERED' && !wanted.includes(r.athleteId)).map((r) => r.id);
    const toAdd = athletes.filter((a) => !have.has(a.id));
    await prisma.$transaction([
      prisma.trackResult.deleteMany({ where: { id: { in: toRemove } } }),
      prisma.trackResult.createMany({
        data: toAdd.map((a) => ({ teamId, trackMeetId: meet.id, eventId: event.id, athleteId: a.id, gender: normalizeGender(a.gender), round: 'FINAL', status: 'ENTERED' })),
        skipDuplicates: true,
      }),
    ]);
    res.json({ added: toAdd.length, removed: toRemove.length });
  } catch (err) {
    console.error('Error saving track entries:', err.message);
    res.status(500).json({ message: 'Could not save those entries.' });
  }
});

// Relay squads. A relay row has no athleteId; its runners are
// relayAthleteIds in leg order, and relayTeam says which squad (A, B...).
async function readRelayBody(req, res) {
  const teamId = req.user.teamId;
  const body = req.body || {};
  const event = await prisma.event.findUnique({ where: { id: String(body.eventId || '') } }).catch(() => null);
  if (!event || !event.isRelay) {
    res.status(400).json({ message: 'Pick a relay event.' });
    return null;
  }
  const legs = Array.isArray(body.athleteIds) ? body.athleteIds.filter(Boolean) : [];
  const max = event.relayLegCount || 4;
  if (legs.length > max || new Set(legs).size !== legs.length) {
    res.status(400).json({ message: `A ${event.name} has ${max} legs, each a different athlete.` });
    return null;
  }
  const found = await prisma.athlete.count({ where: { teamId, id: { in: legs } } });
  if (found !== legs.length) {
    res.status(400).json({ message: 'One or more athletes are not on this team.' });
    return null;
  }
  const raw = String(body.mark || '').trim();
  const parsed = raw ? parseMark(raw, event.unit) : null;
  if (parsed && parsed.status === 'NM') {
    res.status(400).json({ message: 'That time could not be read. Use 44.52 or 3:31.20, or DNS, DQ.' });
    return null;
  }
  const place = parseInt(body.place, 10);
  return {
    event,
    data: {
      relayAthleteIds: legs,
      relayTeam: String(body.relayTeam || 'A').trim().slice(0, 12) || 'A',
      gender: normalizeGender(body.gender),
      markValue: parsed ? parsed.markValue : null,
      status: parsed ? parsed.status : 'ENTERED',
      place: parsed && parsed.status === 'FINISHED' && Number.isInteger(place) && place > 0 ? place : null,
    },
  };
}

// POST /api/track/meets/:meetId/relays { eventId, gender, relayTeam, athleteIds, mark?, place? }
router.post('/meets/:meetId/relays', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const meet = await findMeet(req);
    if (!meet) return res.status(404).json({ message: 'Meet not found.' });
    const parsed = await readRelayBody(req, res);
    if (!parsed) return;
    const row = await prisma.trackResult.create({
      data: { teamId: req.user.teamId, trackMeetId: meet.id, eventId: parsed.event.id, athleteId: null, round: 'FINAL', ...parsed.data },
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('Error creating relay:', err.message);
    res.status(500).json({ message: 'Could not save that relay.' });
  }
});

// PUT /api/track/relays/:resultId — change the legs, the squad, or record the time.
router.put('/relays/:resultId', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const row = await prisma.trackResult.findFirst({ where: { id: req.params.resultId, teamId: req.user.teamId, athleteId: null } });
    if (!row) return res.status(404).json({ message: 'Relay not found.' });
    req.body = { ...req.body, eventId: row.eventId };
    const parsed = await readRelayBody(req, res);
    if (!parsed) return;
    res.json(await prisma.trackResult.update({ where: { id: row.id }, data: parsed.data }));
  } catch (err) {
    console.error('Error updating relay:', err.message);
    res.status(500).json({ message: 'Could not save that relay.' });
  }
});

// DELETE /api/track/relays/:resultId — a squad that has not run yet can be
// dropped by any full coach; one with a time is a result, head coach only.
router.delete('/relays/:resultId', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const row = await prisma.trackResult.findFirst({ where: { id: req.params.resultId, teamId: req.user.teamId, athleteId: null } });
    if (!row) return res.status(404).json({ message: 'Relay not found.' });
    if (row.status !== 'ENTERED' && !(await hasTeamRole(req.user, DESTRUCTIVE)) && !(req.user.isSuperAdmin && req.user.isImpersonating)) {
      return res.status(403).json({ message: 'Only a head coach can remove a relay that has a result.' });
    }
    await prisma.trackResult.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting relay:', err.message);
    res.status(500).json({ message: 'Could not remove that relay.' });
  }
});

// GET /api/track/seasons/:year/relay-suggest?eventId=&gender= — who to
// consider for a relay, from season bests in its open event.
router.get('/seasons/:year/relay-suggest', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const events = await prisma.event.findMany();
    const relay = events.find((e) => e.id === req.query.eventId && e.isRelay);
    if (!relay) return res.status(400).json({ message: 'Pick a relay event.' });
    const legEvent = events.find((e) => e.name === relayLegEventName(relay.name));
    if (!legEvent) return res.json({ legEvent: null, candidates: [], projected: null });
    const gender = normalizeGenderParam(req.query.gender);
    const results = await prisma.trackResult.findMany({
      where: { teamId: req.user.teamId, eventId: legEvent.id, trackMeet: { season: parseInt(req.params.year, 10) || 0 }, ...(gender ? { gender } : {}) },
      select: RESULT_SELECT,
    });
    res.json({ legEvent, ...suggestRelay(results.map(flatten), legEvent) });
  } catch (err) {
    console.error('Error suggesting relay:', err.message);
    res.status(500).json({ message: 'Could not load relay suggestions.' });
  }
});

// POST /api/track/seasons/:year/import-event-progress-csv  { csv }
// Reads the CSV web/src/lib/trackEventProgressPaste.ts makes from the
// Athletic.net Event Progress page a coach copied in their own browser.
// Nothing here contacts Athletic.net, and a paste never deletes anything it
// doesn't mention.
router.post('/seasons/:year/import-event-progress-csv', authenticate, requireRole(FULL_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  const yearNum = parseInt(req.params.year, 10);
  const { csv } = req.body || {};
  const check = checkEventProgressCsv(csv, yearNum);
  if (!check.ok) return res.status(400).json({ message: check.message });

  try {
    const summary = await importEventProgressCsv(req.user.team, yearNum, csv);
    const unmatchedNote = summary.unmatchedEvents.length
      ? ` Results in events LeadPack doesn't track yet were skipped: ${summary.unmatchedEvents.join(', ')}.`
      : '';
    res.status(200).json({
      success: true,
      message: `Imported ${summary.recordsProcessed} results for season ${yearNum}.${unmatchedNote}`,
      ...summary,
    });
  } catch (error) {
    console.error('Error importing track Event Progress CSV:', error.message);
    res.status(500).json({ message: 'Could not finish importing those results. Paste and import them again: rows update in place, so a second run is safe.' });
  }
});

module.exports = router;
module.exports.loadTrackAthlete = loadTrackAthlete;
