const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireRole } = require('../middleware/auth');

// POST /api/data/clear/:season
// Wipes all race/result/metrics data for one season of the CALLER'S OWN
// team. Previously this took teamId from the URL and only checked
// `role === 'coach'` — any coach could wipe any other team's season. Team
// scope now comes exclusively from the authenticated session. Destructive
// enough (deletes race/result data outright) to keep head-coach-only.
router.post('/clear/:season', authenticate, requireRole(['HEAD_COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);
    if (Number.isNaN(season)) {
      return res.status(400).json({ message: 'Invalid season.' });
    }

    // Never a manual (non-scraped) race — see Race.isManual's schema
    // comment. This clears imported data, not hand-entered time trials.
    const races = await prisma.race.findMany({
      where: { teamId, season, isManual: false },
      select: { id: true },
    });
    const raceIds = races.map((r) => r.id);

    let resultsDeleted = 0;
    let racesDeleted = 0;

    if (raceIds.length > 0) {
      const deletedResults = await prisma.result.deleteMany({ where: { raceId: { in: raceIds } } });
      resultsDeleted = deletedResults.count;

      const deletedRaces = await prisma.race.deleteMany({ where: { id: { in: raceIds } } });
      racesDeleted = deletedRaces.count;
    }

    await prisma.teamSeasonMetrics.deleteMany({ where: { teamId, season } });
    await prisma.athleteSeasonMetrics.deleteMany({ where: { teamId, season } });
    await prisma.meetPerformanceMetrics.deleteMany({ where: { teamId, season } });

    res.json({ racesDeleted, resultsDeleted });
  } catch (error) {
    console.error('Error clearing data:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
