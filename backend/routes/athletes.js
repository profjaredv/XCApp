const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');

router.get('/', authenticate, requireTeam, async (req, res) => {
  const { season, activeOnly, search } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = season ? parseInt(season, 10) : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const isCurrentSeason = seasonYear === currentYear;
    const onlyActive = String(activeOnly ?? 'true').toLowerCase() !== 'false';

    const athletes = await prisma.athlete.findMany({
      where: {
        teamId,
        ...(search && search.trim() !== '' ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const results = await prisma.result.findMany({
      where: { teamId, athleteId: { in: athletes.map((a) => a.id) }, race: { season: seasonYear } },
      include: { race: true },
    });

    const resultMap = new Map();
    results.forEach((result) => {
      if (!resultMap.has(result.athleteId)) resultMap.set(result.athleteId, []);
      resultMap.get(result.athleteId).push(result);
    });

    const enriched = athletes.map((a) => {
      const races = resultMap.get(a.id) || [];
      const graduated = typeof a.graduationYear === 'number' ? a.graduationYear <= seasonYear : false;
      return { ...a, races, raceCount: races.length, graduated };
    });

    let filtered = enriched;
    if (onlyActive) {
      filtered = isCurrentSeason
        ? enriched.filter((a) => a.raceCount > 0 || !a.graduated)
        : enriched.filter((a) => a.raceCount > 0);
    }

    res.json(filtered);
  } catch (error) {
    console.error('Error in GET /athletes:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = season ? parseInt(season, 10) : new Date().getFullYear();

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, race: { season: seasonYear } },
      include: { race: true },
    });

    const sortedResults = results.sort((a, b) => new Date(a.race?.date || 0) - new Date(b.race?.date || 0));

    res.json({ ...athlete, results: sortedResults });
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/', authenticate, requireTeam, async (req, res) => {
  const { firstName, lastName, graduationYear, gender } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ msg: 'First name and last name are required' });
  }

  try {
    const athlete = await prisma.athlete.create({
      data: {
        teamId: req.user.teamId,
        name: `${firstName} ${lastName}`,
        graduationYear: graduationYear ? parseInt(graduationYear, 10) : null,
        gender: gender || 'M',
      },
    });

    res.status(201).json(athlete);
  } catch (error) {
    console.error('Error in POST /athletes:', error.message);
    res.status(500).json({ msg: 'Error creating athlete' });
  }
});

router.put('/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { firstName, lastName, graduationYear, gender } = req.body;

  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const updates = {};
    if (firstName && lastName) updates.name = `${firstName} ${lastName}`;
    if (graduationYear !== undefined) updates.graduationYear = graduationYear ? parseInt(graduationYear, 10) : null;
    if (gender) updates.gender = gender;

    const athlete = await prisma.athlete.update({ where: { id: existing.id }, data: updates });
    res.json(athlete);
  } catch (error) {
    console.error('Error in PUT /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error updating athlete' });
  }
});

router.delete('/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    await prisma.athlete.delete({ where: { id: existing.id } });
    res.json({ msg: 'Athlete deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error deleting athlete' });
  }
});

module.exports = router;
