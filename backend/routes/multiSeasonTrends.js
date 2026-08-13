const express = require('express');
const { authenticate, requireTeam } = require('../middleware/auth');
const logger = require('../utils/logger');
const prisma = require('../lib/db');
const { parseDistanceToMeters, metersToMiles, MILE_IN_METERS } = require('../lib/distance');

const router = express.Router();

// Prefer the already-parsed Race.distanceMeters (set at ingest — see
// routes/teams.js); fall back to parsing Race.distance text only for races
// imported before that field was reliably populated. Both paths now go
// through the one shared parser — this used to have its own regex with a
// completely different (wrong) idea of what "5,000 meters" means.
const parseDistanceMiles = (race) => {
  const meters = race?.distanceMeters > 0 ? race.distanceMeters : parseDistanceToMeters(race?.distance);
  return metersToMiles(meters) ?? 0;
};

// GET /api/multi-season/trends
//
// F4 (pre-season fix): this view silently dropped every state/championship
// race (line below, /state|championship/i) and took an unweighted mean
// across every athlete and every course — wrong, and live. Disabled below
// rather than deleted: Part B replaces it with GET /api/analytics/bands,
// a real band-based (top/middle/bottom) implementation with none of that.
// The route stays registered and its logic below stays correct/up to date
// (F1's divisor fix, F3's status filter both still applied) in case Part B
// slips — better a maintained-but-off endpoint than a disabled-and-rotting
// one — but every caller gets 501 until that lands.
router.get('/trends', authenticate, requireTeam, async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Multi-season analysis is being rebuilt. Check back soon.',
  });

  try {
    const teamId = req.user.teamId;

    const raceSeasons = await prisma.race.findMany({
      where: { teamId },
      select: { season: true },
      distinct: ['season'],
    });
    const seasons = raceSeasons.map((r) => r.season).sort((a, b) => a - b);

    if (!seasons.length) {
      return res.json({ success: true, data: { seasons: [], trends: [] } });
    }

    const multiSeasonData = await Promise.all(
      seasons.map(async (season) => {
        const emptyTrend = {
          season,
          avg5K: { girls: null, boys: null, team: null },
          avgPace: { girls: null, boys: null, team: null },
          stateMeet: { avg5K: { girls: null, boys: null, team: null }, avgPace: { girls: null, boys: null, team: null }, hasData: false },
          hasData: false,
        };

        const results = await prisma.result.findMany({
          where: { teamId, status: 'FINISHED', time: { gt: 0 }, race: { season } },
          include: { athlete: { select: { id: true, name: true, gender: true, grade: true } }, race: true },
        });

        if (results.length === 0) return emptyTrend;

        const validResults = results.filter((result) => {
          const isStateMeet = result.race?.name && /state|championship/i.test(result.race.name);
          return !isStateMeet && result.time > 0;
        });

        const resultsWithPace = validResults
          .map((result) => {
            const distanceMiles = parseDistanceMiles(result.race);
            const pace = distanceMiles > 0 ? result.time / distanceMiles : 0;
            return { ...result, pace };
          })
          .filter((r) => r.pace > 0 && r.pace < 1800);

        const girls = resultsWithPace.filter((r) => ['F', 'Women'].includes(r.athlete?.gender));
        const boys = resultsWithPace.filter((r) => ['M', 'Men'].includes(r.athlete?.gender));

        const avgPace = (arr) => (arr.length ? arr.reduce((s, r) => s + r.pace, 0) / arr.length : 0);
        const teamAvgPace = avgPace(resultsWithPace);
        const girlsAvgPace = avgPace(girls);
        const boysAvgPace = avgPace(boys);

        // Not the F1 bug itself — resultsWithPace above already converts
        // each result through its own real race distance. This just turns
        // an already-correct pace into a nominal 5K-equivalent display
        // time, so the magic number is sourced from lib/distance.js
        // instead of a bare literal.
        const milesPer5k = 5000 / MILE_IN_METERS;
        const teamAvg5K = teamAvgPace > 0 ? teamAvgPace * milesPer5k : 0;
        const girlsAvg5K = girlsAvgPace > 0 ? girlsAvgPace * milesPer5k : 0;
        const boysAvg5K = boysAvgPace > 0 ? boysAvgPace * milesPer5k : 0;

        return {
          season,
          avg5K: { girls: girlsAvg5K || null, boys: boysAvg5K || null, team: teamAvg5K || null },
          avgPace: { girls: girlsAvgPace || null, boys: boysAvgPace || null, team: teamAvgPace || null },
          stateMeet: { avg5K: { girls: null, boys: null, team: null }, avgPace: { girls: null, boys: null, team: null }, hasData: false },
          hasData: resultsWithPace.length > 0,
        };
      })
    );

    res.json({ success: true, data: { seasons, trends: multiSeasonData } });
  } catch (error) {
    logger.error(`Error fetching multi-season trends: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch multi-season trends' });
  }
});

module.exports = router;
