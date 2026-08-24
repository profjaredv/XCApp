const express = require('express');
const router = express.Router();
const { authenticate, requireTeam } = require('../middleware/auth');
const prisma = require('../lib/db');

router.get('/', authenticate, requireTeam, async (req, res) => {
  try {
    const results = await prisma.result.findMany({
      where: { teamId: req.user.teamId },
      include: {
        athlete: { select: { id: true, name: true, preferredName: true, graduationYear: true, gender: true, grade: true } },
        race: { select: { id: true, name: true, date: true, distance: true, season: true } },
      },
    });

    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching results:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
