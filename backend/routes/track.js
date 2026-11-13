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
const { authenticate, requireRole } = require('../middleware/auth');
const { requireFeature } = require('../middleware/teamFeatures');
const { FULL_COACH, ANY_COACH } = require('../lib/teamRoles');
const { decideCanAccessSportScopedResource } = require('../lib/groupPermissions');
const { checkEventProgressCsv } = require('../lib/trackEventProgressCsv');
const { importEventProgressCsv } = require('../lib/trackEventProgressImport');
const { seasonLeaders, pointsContribution, athleteProgression, parseScoringTable, DEFAULT_SCORING_TABLE } = require('../lib/trackAnalytics');

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
    res.json(seasonLeaders(results.map(flatten), events));
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

// GET /api/track/athletes/:athleteId — one athlete's marks by event, with
// PRs flagged. The athlete must be on the caller's team.
router.get('/athletes/:athleteId', authenticate, requireRole(ANY_COACH), requireFeature('track'), requireTrackSport, async (req, res) => {
  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
      select: { id: true, name: true, gender: true, graduationYear: true },
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found.' });
    const [events, results] = await Promise.all([
      prisma.event.findMany(),
      prisma.trackResult.findMany({ where: { teamId: req.user.teamId, athleteId: athlete.id }, select: RESULT_SELECT }),
    ]);
    res.json({ athlete, events: athleteProgression(results.map(flatten), events) });
  } catch (err) {
    console.error('Error fetching track athlete:', err.message);
    res.status(500).json({ message: 'Could not load that athlete.' });
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
