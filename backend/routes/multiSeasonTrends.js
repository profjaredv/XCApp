const express = require('express');
const { authenticate, requireTeam } = require('../middleware/auth');
const logger = require('../utils/logger');
const prisma = require('../lib/db');

const router = express.Router();

const toMiles = (meters) => (meters > 0 ? meters / 1609.34 : 0);

const parseDistanceMiles = (race) => {
  const meters = race?.distanceMeters || 0;
  if (meters > 0) return toMiles(meters);

  const label = (race?.distance || '').toLowerCase();
  if (label.includes('5k') || label.includes('5 k')) return 3.1;
  if (label.includes('3k') || label.includes('3 k')) return 1.86;
  if (label.includes('2 mile')) return 2;
  if (label.includes('1 mile') || label === 'mile') return 1;

  const numMatch = label.match(/^(\d+(?:\.\d+)?)\s*(?:mile|mi|m|k|km|meter|meters)?/i);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);
    if (label.includes('k') || label.includes('km')) return value * 0.621371;
    return value;
  }

  return 0;
};

// GET /api/multi-season/trends
router.get('/trends', authenticate, requireTeam, async (req, res) => {
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
          where: { teamId, time: { gt: 0 }, race: { season } },
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

        const milesPer5k = 3.10686;
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
