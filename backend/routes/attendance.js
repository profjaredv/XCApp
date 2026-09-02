const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { ANY_COACH } = require('../lib/teamRoles');
const { deriveGrade, isEnrolled } = require('../lib/season');
const { requireFeature } = require('../middleware/teamFeatures');

// Attendance tracking — a digitized version of the physical clipboard a
// team already uses: a roster sorted by grade then last name (the
// frontend's job — this just returns name/grade), one row per athlete,
// marked present/absent/excused/late for a given date/time/location. Any
// coach-tier role can take attendance, same access level interval
// sessions use — there's no "led group" concept to scope this to, and a
// volunteer coach covering a satellite practice is exactly who needs it.

function serializeSession(session) {
  const counts = { PRESENT: 0, ABSENT: 0, EXCUSED: 0, LATE: 0 };
  for (const r of session.records || []) counts[r.status] = (counts[r.status] || 0) + 1;
  return {
    id: session.id,
    seasonId: session.seasonId,
    date: session.date,
    time: session.time,
    location: session.location ? { id: session.location.id, name: session.location.name } : null,
    createdAt: session.createdAt,
    counts,
    recordCount: (session.records || []).length,
  };
}

// Same "explicit roster if one exists, else derive from graduation year"
// resolution GET /athletes uses, narrowed to just the athlete ids a new
// session needs. Shared by POST / and GET /week so both seed a day the
// same way.
async function resolveRosterAthleteIds(teamId, seasonId, season) {
  const rosterRows = await prisma.seasonRoster.findMany({ where: { seasonId, isActive: true }, select: { athleteId: true } });
  if (rosterRows.length > 0) {
    return rosterRows.map((r) => r.athleteId);
  }
  const allAthletes = await prisma.athlete.findMany({ where: { teamId }, select: { id: true, graduationYear: true } });
  return allAthletes.filter((a) => isEnrolled(a.graduationYear, season.year)).map((a) => a.id);
}

const SESSION_DETAIL_INCLUDE = {
  location: true,
  records: { include: { athlete: { select: { id: true, name: true, preferredName: true, gender: true, graduationYear: true } } } },
};

// Shapes one session's records for a response, resolving grade the same
// way GET /:sessionId always has: SeasonRoster.grade if the coach has
// corrected it, else derived from graduationYear.
function serializeRecords(session, gradeByAthleteId, seasonYear) {
  return session.records.map((r) => ({
    id: r.id,
    athleteId: r.athleteId,
    name: r.athlete.preferredName || r.athlete.name,
    gender: r.athlete.gender,
    grade: gradeByAthleteId.get(r.athleteId) ?? deriveGrade(r.athlete.graduationYear, seasonYear),
    status: r.status,
    notes: r.notes,
    updatedAt: r.updatedAt,
  }));
}

async function gradeByAthleteIdFor(seasonId, athleteIds) {
  const rows = await prisma.seasonRoster.findMany({
    where: { seasonId, athleteId: { in: athleteIds } },
    select: { athleteId: true, grade: true },
  });
  return new Map(rows.map((r) => [r.athleteId, r.grade]));
}

// Finds the one session for (team, season, date) — the unique constraint
// added alongside this route guarantees there's at most one — or creates
// it seeded from the roster. If two coaches race to open the same
// previously-empty date at once, the loser's create hits that constraint
// (P2002); it just re-reads the winner's row instead of erroring, so
// neither coach sees a failure and no duplicate is created.
async function findOrCreateSessionForDate(teamId, seasonId, date, createdById, athleteIds) {
  const existing = await prisma.attendanceSession.findUnique({
    where: { teamId_seasonId_date: { teamId, seasonId, date } },
    include: SESSION_DETAIL_INCLUDE,
  });
  if (existing) return existing;

  try {
    return await prisma.attendanceSession.create({
      data: {
        teamId,
        seasonId,
        date,
        createdById,
        records: { create: athleteIds.map((athleteId) => ({ athleteId })) },
      },
      include: SESSION_DETAIL_INCLUDE,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return prisma.attendanceSession.findUnique({
        where: { teamId_seasonId_date: { teamId, seasonId, date } },
        include: SESSION_DETAIL_INCLUDE,
      });
    }
    throw error;
  }
}

// GET /api/attendance?seasonId= — every session for a season, most
// recent first, with per-status counts for the list view.
router.get('/', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: { seasonId },
      include: { location: true, records: { select: { status: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    res.json(sessions.map(serializeSession));
  } catch (error) {
    console.error('Error listing attendance sessions:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance — creates a session and seeds one record per
// athlete currently on that season's active roster, defaulted to blank
// (see AttendanceRecord's schema comment on why ABSENT-by-default now).
// Seeded once, never re-synced — an athlete added to the team later
// doesn't retroactively appear on a past session; someone unexpected at
// practice is added with POST .../records instead.
//
// If a session for this exact (team, season, date) already exists — most
// likely because the week view already created it — this returns that
// existing session (200) instead of erroring or creating a duplicate; the
// unique constraint on AttendanceSession makes a true duplicate
// impossible even under a concurrent double-submit.
router.post('/', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { seasonId, date, time, locationId } = req.body;
  if (!seasonId || !date) {
    return res.status(400).json({ msg: 'seasonId and date are required.' });
  }

  try {
    const teamId = req.user.teamId;
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    if (locationId) {
      const location = await prisma.practiceLocation.findFirst({ where: { id: locationId, teamId } });
      if (!location) return res.status(404).json({ msg: 'Location not found.' });
    }

    const parsedDate = new Date(date);
    const existing = await prisma.attendanceSession.findUnique({
      where: { teamId_seasonId_date: { teamId, seasonId, date: parsedDate } },
      include: { location: true, records: { select: { status: true } } },
    });
    if (existing) {
      return res.status(200).json(serializeSession(existing));
    }

    const athleteIds = await resolveRosterAthleteIds(teamId, seasonId, season);

    let session;
    try {
      session = await prisma.attendanceSession.create({
        data: {
          teamId,
          seasonId,
          date: parsedDate,
          time: time || null,
          locationId: locationId || null,
          createdById: req.user.id,
          records: { create: athleteIds.map((athleteId) => ({ athleteId })) },
        },
        include: { location: true, records: { select: { status: true } } },
      });
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      // Lost the race to a concurrent create for the same date — use theirs.
      session = await prisma.attendanceSession.findUnique({
        where: { teamId_seasonId_date: { teamId, seasonId, date: parsedDate } },
        include: { location: true, records: { select: { status: true } } },
      });
      return res.status(200).json(serializeSession(session));
    }

    res.status(201).json(serializeSession(session));
  } catch (error) {
    console.error('Error creating attendance session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/week?seasonId=&weekStart= — the primary take-attendance
// view: five sessions (weekStart .. weekStart+4, meant to be a Monday..Friday
// range, but this route doesn't enforce that so a coach starting the season
// mid-week isn't blocked) found or created in one call via
// findOrCreateSessionForDate, each with full grade-resolved records — so the
// frontend never has to make five separate requests, or worry about two
// coaches opening the same brand-new week at once creating duplicate days.
router.get('/week', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { seasonId, weekStart } = req.query;
  if (!seasonId || !weekStart) {
    return res.status(400).json({ msg: 'seasonId and weekStart are required.' });
  }

  try {
    const teamId = req.user.teamId;
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const start = new Date(weekStart);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ msg: 'weekStart must be a valid date.' });
    }
    const dates = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d;
    });

    const athleteIds = await resolveRosterAthleteIds(teamId, seasonId, season);
    const sessions = await Promise.all(
      dates.map((d) => findOrCreateSessionForDate(teamId, seasonId, d, req.user.id, athleteIds))
    );

    const allAthleteIds = [...new Set(sessions.flatMap((s) => s.records.map((r) => r.athleteId)))];
    const gradeByAthleteId = await gradeByAthleteIdFor(seasonId, allAthleteIds);

    res.json({
      seasonId,
      weekStart: dates[0].toISOString().slice(0, 10),
      days: sessions.map((session, i) => ({
        date: dates[i].toISOString().slice(0, 10),
        sessionId: session.id,
        time: session.time,
        location: session.location ? { id: session.location.id, name: session.location.name } : null,
        records: serializeRecords(session, gradeByAthleteId, season.year),
      })),
    });
  } catch (error) {
    console.error('Error fetching attendance week:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/attendance/:sessionId — full detail, one row per athlete with
// their name/grade (derived the same way the roster page does — SeasonRoster.grade
// if the coach has corrected it, else from graduationYear) for the
// frontend to group by grade / sort by last name.
router.get('/:sessionId', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const session = await prisma.attendanceSession.findFirst({
      where: { id: req.params.sessionId, teamId: req.user.teamId },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (!session) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }

    const season = await prisma.season.findFirst({ where: { id: session.seasonId }, select: { id: true, year: true } });
    const gradeByAthleteId = season
      ? await gradeByAthleteIdFor(season.id, session.records.map((r) => r.athleteId))
      : new Map();

    res.json({
      ...serializeSession(session),
      records: serializeRecords(session, gradeByAthleteId, season?.year),
    });
  } catch (error) {
    console.error('Error fetching attendance session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/attendance/:sessionId — session-level fields only. Field-
// scoped (only keys actually present in the body are written) so editing
// the location doesn't have to also resend the date/time, and two coaches
// touching different session-level fields at once can't clobber each
// other — same lesson as practice plans/splits/results this session.
router.patch('/:sessionId', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { date, time, locationId } = req.body;

  try {
    const existing = await prisma.attendanceSession.findFirst({ where: { id: req.params.sessionId, teamId: req.user.teamId } });
    if (!existing) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }
    if (locationId) {
      const location = await prisma.practiceLocation.findFirst({ where: { id: locationId, teamId: req.user.teamId } });
      if (!location) return res.status(404).json({ msg: 'Location not found.' });
    }

    const updates = {};
    if (date !== undefined) updates.date = new Date(date);
    if (time !== undefined) updates.time = time || null;
    if (locationId !== undefined) updates.locationId = locationId || null;

    const session = await prisma.attendanceSession.update({
      where: { id: existing.id },
      data: updates,
      include: { location: true, records: { select: { status: true } } },
    });
    res.json(serializeSession(session));
  } catch (error) {
    console.error('Error updating attendance session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/attendance/:sessionId
router.delete('/:sessionId', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const existing = await prisma.attendanceSession.findFirst({ where: { id: req.params.sessionId, teamId: req.user.teamId } });
    if (!existing) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }
    await prisma.attendanceSession.delete({ where: { id: existing.id } });
    res.json({ msg: 'Deleted' });
  } catch (error) {
    console.error('Error deleting attendance session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/attendance/:sessionId/records — adds one athlete not in the
// original roster snapshot (e.g. a walk-on that day). Defaults to blank
// (ABSENT), same as every other record.
router.post('/:sessionId/records', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { athleteId } = req.body;
  if (!athleteId) {
    return res.status(400).json({ msg: 'athleteId is required.' });
  }

  try {
    const teamId = req.user.teamId;
    const session = await prisma.attendanceSession.findFirst({ where: { id: req.params.sessionId, teamId } });
    if (!session) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const record = await prisma.attendanceRecord.create({
      data: { attendanceSessionId: session.id, athleteId },
    });
    res.status(201).json({ id: record.id, athleteId: record.athleteId, status: record.status, notes: record.notes });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'That athlete already has a row in this session.' });
    }
    console.error('Error adding attendance record:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/attendance/:sessionId/records/:athleteId — one athlete's
// status/notes. Field-scoped and single-record by construction, so
// there's nothing here that could ever resend or clobber another
// athlete's row, or another field of this one, the way a full-roster
// resend (the meet-results bug fixed earlier this session) could.
router.patch('/:sessionId/records/:athleteId', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { status, notes } = req.body;
  if (status !== undefined && !['PRESENT', 'ABSENT', 'EXCUSED', 'LATE'].includes(status)) {
    return res.status(400).json({ msg: 'status must be one of PRESENT, ABSENT, EXCUSED, LATE.' });
  }

  try {
    const session = await prisma.attendanceSession.findFirst({ where: { id: req.params.sessionId, teamId: req.user.teamId } });
    if (!session) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }
    const record = await prisma.attendanceRecord.findUnique({
      where: { attendanceSessionId_athleteId: { attendanceSessionId: session.id, athleteId: req.params.athleteId } },
    });
    if (!record) {
      return res.status(404).json({ msg: 'That athlete is not on this session.' });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes || null;

    const updated = await prisma.attendanceRecord.update({ where: { id: record.id }, data: updates });
    res.json({ id: updated.id, athleteId: updated.athleteId, status: updated.status, notes: updated.notes });
  } catch (error) {
    console.error('Error updating attendance record:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/attendance/:sessionId/records/:athleteId — removes one
// athlete added by mistake (a genuine slip, not "mark as absent" — use
// PATCH status=ABSENT for that; this deletes the row entirely).
router.delete('/:sessionId/records/:athleteId', authenticate, requireFeature('attendance'), requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const session = await prisma.attendanceSession.findFirst({ where: { id: req.params.sessionId, teamId: req.user.teamId } });
    if (!session) {
      return res.status(404).json({ msg: 'Attendance session not found.' });
    }
    const deleted = await prisma.attendanceRecord.deleteMany({
      where: { attendanceSessionId: session.id, athleteId: req.params.athleteId },
    });
    if (deleted.count === 0) {
      return res.status(404).json({ msg: 'That athlete is not on this session.' });
    }
    res.json({ msg: 'Removed' });
  } catch (error) {
    console.error('Error removing attendance record:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
