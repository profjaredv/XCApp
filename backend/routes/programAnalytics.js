// Program tab (nav "Program" -> BandTrendsPage, GET /api/analytics/program):
// the multi-season "does the data tell a story" view. Participants and
// attrition are computed live from SeasonRoster (the ground-truth roster
// source — accurate whether or not a coach has ever hit "Recalculate
// Metrics") — see lib/programAnalytics.js for the retention-curve math.
// Miles logged and top-20%-of-field are read from the pre-calculated
// TeamSeasonMetrics row for that season (same source DashboardTab.tsx
// already relies on), so they're null for a season nobody has calculated
// yet rather than silently wrong or requiring a second, duplicate live
// computation of field scoring here.

const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');
const { computeAttritionCurve } = require('../lib/programAnalytics');
const { getBenchmark } = require('../lib/programBenchmarks');

const ATTRITION_WINDOWS = [1, 2, 3, 4];

router.get('/', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;
  const sport = req.query.sport || 'XC';

  try {
    const seasons = await prisma.season.findMany({
      where: { teamId, sport },
      orderBy: { year: 'asc' },
      select: { id: true, year: true },
    });

    if (seasons.length === 0) {
      return res.json({
        success: true,
        seasons: [],
        attrition: { windows: ATTRITION_WINDOWS, retention: {}, cohortSizes: {} },
      });
    }

    const seasonIds = seasons.map((s) => s.id);
    const seasonYearById = new Map(seasons.map((s) => [s.id, s.year]));

    const [rosterRows, teamMetrics] = await Promise.all([
      prisma.seasonRoster.findMany({
        where: { seasonId: { in: seasonIds }, isActive: true },
        select: { athleteId: true, grade: true, seasonId: true, athlete: { select: { gender: true } } },
      }),
      prisma.teamSeasonMetrics.findMany({
        where: { teamId, season: { in: seasons.map((s) => s.year) } },
        select: { season: true, totalMiles: true, fieldStanding: true },
      }),
    ]);

    const metricsBySeasonYear = new Map(teamMetrics.map((m) => [m.season, m]));

    const bySeason = seasons.map((s) => {
      const rows = rosterRows.filter((r) => r.seasonId === s.id);
      const men = rows.filter((r) => r.athlete?.gender === 'M').length;
      const women = rows.filter((r) => r.athlete?.gender === 'F').length;
      const metrics = metricsBySeasonYear.get(s.year);
      const fieldStanding = metrics?.fieldStanding || null;

      return {
        season: s.year,
        participants: { total: rows.length, men, women },
        milesLogged: metrics?.totalMiles ?? null,
        metricsCalculated: !!metrics,
        topField: {
          men: fieldStanding?.men?.top20Percent ?? null,
          women: fieldStanding?.women?.top20Percent ?? null,
        },
        benchmarks: {
          men: getBenchmark(s.year, 'M'),
          women: getBenchmark(s.year, 'F'),
        },
      };
    });

    const attritionInput = rosterRows.map((r) => ({
      athleteId: r.athleteId,
      year: seasonYearById.get(r.seasonId),
      grade: r.grade,
    }));
    const attrition = computeAttritionCurve(attritionInput, ATTRITION_WINDOWS);

    res.json({ success: true, seasons: bySeason, attrition });
  } catch (err) {
    console.error('Error computing program analytics:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
