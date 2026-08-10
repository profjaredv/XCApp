const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');

router.get('/', authenticate, requireTeam, async (req, res) => {
  const { sport = 'XC' } = req.query;

  try {
    const seasons = await prisma.season.findMany({
      where: { teamId: req.user.teamId, sport },
      orderBy: { year: 'desc' },
    });
    res.json(seasons);
  } catch (err) {
    console.error('Error fetching seasons:', err.message);
    res.status(500).json({ msg: 'Error fetching seasons' });
  }
});

router.get('/current', authenticate, requireTeam, async (req, res) => {
  const { sport = 'XC' } = req.query;

  try {
    const currentSeason = await prisma.season.findFirst({
      where: { teamId: req.user.teamId, sport, isActive: true },
    });

    if (!currentSeason) {
      return res.status(404).json({ msg: 'No active season found.' });
    }

    res.json(currentSeason);
  } catch (err) {
    console.error('Error fetching current season:', err.message);
    res.status(500).json({ msg: 'Error fetching current season' });
  }
});

router.post('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { year, sport = 'XC', startDate, endDate } = req.body;
  const teamId = req.user.teamId;

  if (!year) {
    return res.status(400).json({ msg: 'Year is required.' });
  }

  try {
    const existing = await prisma.season.findUnique({ where: { teamId_year_sport: { teamId, year, sport } } });
    if (existing) {
      return res.status(400).json({ msg: 'Season already exists.' });
    }

    const season = await prisma.season.create({
      data: {
        year,
        sport,
        teamId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: false,
      },
    });

    res.json(season);
  } catch (err) {
    console.error('Error creating season:', err.message);
    res.status(500).json({ msg: 'Error creating season' });
  }
});

router.put('/:id', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { isActive, startDate, endDate } = req.body;
  const teamId = req.user.teamId;

  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    if (isActive) {
      await prisma.season.updateMany({
        where: { teamId, sport: season.sport, id: { not: season.id } },
        data: { isActive: false },
      });
    }

    const updates = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (startDate) updates.startDate = new Date(startDate);
    if (endDate) updates.endDate = new Date(endDate);

    const updated = await prisma.season.update({ where: { id: season.id }, data: updates });
    res.json(updated);
  } catch (err) {
    console.error('Error updating season:', err.message);
    res.status(500).json({ msg: 'Error updating season' });
  }
});

router.post('/:id/roster', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { athletes } = req.body;
  const teamId = req.user.teamId;

  if (!athletes || !Array.isArray(athletes)) {
    return res.status(400).json({ msg: 'Athletes array is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const rosterEntries = athletes.filter((a) => a.id && a.grade);
    for (const entry of rosterEntries) {
      await prisma.seasonRoster.upsert({
        where: { seasonId_athleteId: { seasonId: season.id, athleteId: entry.id } },
        update: { grade: parseInt(entry.grade, 10), isActive: true },
        create: { seasonId: season.id, athleteId: entry.id, grade: parseInt(entry.grade, 10), isActive: true },
      });
    }

    const updatedRoster = await prisma.seasonRoster.findMany({
      where: { seasonId: season.id },
      include: { athlete: true },
    });

    res.json({ ...season, roster: updatedRoster });
  } catch (err) {
    console.error('Error updating roster:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/seasons/:id/roster/:athleteId
// T1: captain designation. isCaptain/captainNotes live on the per-season
// SeasonRoster row (captaincy is annual, per the Build Spec), not on
// Athlete or TeamMember — being a captain grants no extra data access by
// itself, that's entirely a function of GroupLeader once T2 exists.
router.patch('/:id/roster/:athleteId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { isCaptain, captainNotes } = req.body;
  const teamId = req.user.teamId;

  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const entry = await prisma.seasonRoster.findUnique({
      where: { seasonId_athleteId: { seasonId: season.id, athleteId: req.params.athleteId } },
    });
    if (!entry) {
      return res.status(404).json({ msg: 'Athlete is not on this season\'s roster.' });
    }

    const updates = {};
    if (isCaptain !== undefined) updates.isCaptain = Boolean(isCaptain);
    if (captainNotes !== undefined) updates.captainNotes = captainNotes || null;

    const updated = await prisma.seasonRoster.update({ where: { id: entry.id }, data: updates });
    res.json(updated);
  } catch (err) {
    console.error('Error updating captain designation:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:id/roster/:athleteId', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    await prisma.seasonRoster.deleteMany({ where: { seasonId: req.params.id, athleteId: req.params.athleteId } });
    res.json({ msg: 'Athlete removed from roster' });
  } catch (err) {
    console.error('Error removing from roster:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:id/roster', authenticate, requireTeam, async (req, res) => {
  const { activeOnly = 'true' } = req.query;

  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const roster = await prisma.seasonRoster.findMany({
      where: { seasonId: req.params.id, ...(activeOnly === 'true' ? { isActive: true } : {}) },
      include: { athlete: true },
    });

    res.json(roster);
  } catch (err) {
    console.error('Error fetching roster:', err.message);
    res.status(500).json({ msg: 'Error fetching roster' });
  }
});

router.delete('/:id/results', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const season = await prisma.season.findFirst({ where: { id: req.params.id, teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const races = await prisma.race.findMany({ where: { teamId, season: season.year }, select: { id: true } });
    if (races.length > 0) {
      await prisma.result.deleteMany({ where: { raceId: { in: races.map((r) => r.id) } } });
    }

    res.json({ success: true, message: `Cleared results for season ${season.year}` });
  } catch (err) {
    console.error('Error clearing season results:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
