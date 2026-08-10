const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');

router.get('/race/:raceId', authenticate, requireTeam, async (req, res) => {
  try {
    const splits = await prisma.raceSplit.findMany({
      where: { raceId: req.params.raceId, teamId: req.user.teamId },
      include: {
        athlete: { select: { id: true, name: true, gender: true, grade: true } },
        result: { select: { time: true, place: true } },
      },
    });

    splits.sort((a, b) => (a.result?.place || 0) - (b.result?.place || 0));
    res.json(splits);
  } catch (err) {
    console.error('Error fetching race splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/athlete/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const splits = await prisma.raceSplit.findMany({
      where: { athleteId: req.params.athleteId, teamId: req.user.teamId },
      include: {
        race: { select: { id: true, name: true, date: true, distance: true } },
        result: { select: { time: true, place: true } },
      },
      orderBy: { race: { date: 'desc' } },
    });

    res.json(splits);
  } catch (err) {
    console.error('Error fetching athlete splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/batch', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const { splits } = req.body;
    const teamId = req.user.teamId;
    const userId = req.user.id;

    if (!Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ msg: 'Splits array required' });
    }

    // resultId, athleteId and raceId were previously taken straight from the
    // request body and written as-is: a coach could pass a resultId from a
    // DIFFERENT team and either overwrite that team's split (the upsert
    // matched on resultId with no team scoping) or create a split row whose
    // athleteId/raceId didn't even match its resultId. Now every resultId is
    // verified to belong to the caller's team before anything is written,
    // and athleteId/raceId are read from that verified Result row — never
    // trusted from the client.
    const resultIds = [...new Set(splits.map((s) => s.resultId))];
    const results = await prisma.result.findMany({
      where: { id: { in: resultIds }, teamId },
      select: { id: true, athleteId: true, raceId: true },
    });
    if (results.length !== resultIds.length) {
      return res.status(403).json({ msg: 'One or more results do not belong to your team.' });
    }
    const resultById = new Map(results.map((r) => [r.id, r]));

    const saved = await prisma.$transaction(
      splits.map((split) => {
        const result = resultById.get(split.resultId);
        return prisma.raceSplit.upsert({
          where: { resultId: split.resultId },
          update: {
            mile1: parseFloat(split.mile1),
            mile2: parseFloat(split.mile2),
            mile3: parseFloat(split.mile3),
          },
          create: {
            resultId: split.resultId,
            athleteId: result.athleteId,
            raceId: result.raceId,
            teamId,
            mile1: parseFloat(split.mile1),
            mile2: parseFloat(split.mile2),
            mile3: parseFloat(split.mile3),
            createdById: userId,
          },
        });
      })
    );

    res.json({ success: true, count: saved.length, splits: saved });
  } catch (err) {
    console.error('Error saving splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/:splitId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const { mile1, mile2, mile3 } = req.body;

    const existing = await prisma.raceSplit.findFirst({
      where: { id: req.params.splitId, teamId: req.user.teamId },
    });
    if (!existing) {
      return res.status(404).json({ msg: 'Split not found' });
    }

    const updated = await prisma.raceSplit.update({
      where: { id: existing.id },
      data: { mile1: parseFloat(mile1), mile2: parseFloat(mile2), mile3: parseFloat(mile3) },
    });

    res.json(updated);
  } catch (err) {
    console.error('Error updating split:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:splitId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const existing = await prisma.raceSplit.findFirst({
      where: { id: req.params.splitId, teamId: req.user.teamId },
    });
    if (!existing) {
      return res.status(404).json({ msg: 'Split not found' });
    }

    await prisma.raceSplit.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting split:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
