const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireCoach } = require('../middleware/auth');

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

router.post('/batch', authenticate, requireTeam, requireCoach, async (req, res) => {
  try {
    const { splits } = req.body;
    const teamId = req.user.teamId;
    const userId = req.user.id;

    if (!Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ msg: 'Splits array required' });
    }

    const saved = await Promise.all(
      splits.map((split) =>
        prisma.raceSplit.upsert({
          where: { resultId: split.resultId },
          update: {
            mile1: parseFloat(split.mile1),
            mile2: parseFloat(split.mile2),
            mile3: parseFloat(split.mile3),
          },
          create: {
            resultId: split.resultId,
            athleteId: split.athleteId,
            raceId: split.raceId,
            teamId,
            mile1: parseFloat(split.mile1),
            mile2: parseFloat(split.mile2),
            mile3: parseFloat(split.mile3),
            createdById: userId,
          },
        })
      )
    );

    res.json({ success: true, count: saved.length, splits: saved });
  } catch (err) {
    console.error('Error saving splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/:splitId', authenticate, requireTeam, requireCoach, async (req, res) => {
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

router.delete('/:splitId', authenticate, requireTeam, requireCoach, async (req, res) => {
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
