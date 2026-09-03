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
const { getBenchmark, buildSelfBenchmarks } = require('../lib/programBenchmarks');
const { countPostseason } = require('../lib/postseason');
const { buildSeasonShapes } = require('../lib/programSeasons');
const { buildProgramStory } = require('../lib/programStory');
const { parseDistanceToMeters } = require('../lib/distance');
const { normalizeGender } = require('../lib/gender');

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
        attrition: { windows: ATTRITION_WINDOWS, retention: {}, cohortSizes: {}, leftCensored: 0, earliestSeason: null },
        postseason: [],
        bests: {},
        story: buildProgramStory([], null, [], new Map()),
      });
    }

    const seasonIds = seasons.map((s) => s.id);
    const seasonYearById = new Map(seasons.map((s) => [s.id, s.year]));

    const years = seasons.map((s) => s.year);

    const [rosterRows, teamMetrics, results] = await Promise.all([
      prisma.seasonRoster.findMany({
        where: { seasonId: { in: seasonIds }, isActive: true },
        select: { athleteId: true, grade: true, seasonId: true, athlete: { select: { gender: true } } },
      }),
      prisma.teamSeasonMetrics.findMany({
        where: { teamId, season: { in: years } },
        select: { season: true, totalMiles: true, fieldStanding: true },
      }),
      // Live, from results. Everything derived below — meets, miles,
      // median pace, pack spread — used to come from TeamSeasonMetrics,
      // which only exists for seasons somebody remembered to run
      // "Recalculate Metrics" on. A screen about a program's history
      // cannot depend on a manual step nobody was told to take.
      prisma.result.findMany({
        where: { status: 'FINISHED', time: { gt: 0 }, race: { teamId, season: { in: years } } },
        select: {
          athleteId: true,
          time: true,
          athlete: { select: { gender: true } },
          race: {
            select: {
              id: true,
              name: true,
              date: true,
              season: true,
              distance: true,
              distanceMeters: true,
              postseasonLevel: true,
            },
          },
        },
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

    const resultRows = results
      .filter((r) => r.athlete)
      .map((r) => ({
        athleteId: r.athleteId,
        gender: normalizeGender(r.athlete.gender),
        season: r.race.season,
        raceId: r.race.id,
        raceName: r.race.name,
        date: r.race.date,
        timeSec: r.time,
        distanceMeters: r.race.distanceMeters ?? parseDistanceToMeters(r.race.distance),
      }));

    const rosterByYear = new Map();
    for (const row of rosterRows) {
      const year = seasonYearById.get(row.seasonId);
      if (!rosterByYear.has(year)) rosterByYear.set(year, new Set());
      rosterByYear.get(year).add(row.athleteId);
    }

    const shapes = buildSeasonShapes(resultRows, rosterByYear, years);
    const shapeBySeason = new Map(shapes.map((shape) => [shape.season, shape]));
    const participants = new Map(bySeason.map((s) => [s.season, s.participants]));

    // One row per season carrying both halves, so the client never has to
    // join two arrays by year to render a single chart.
    const merged = bySeason.map((s) => ({ ...s, ...shapeBySeason.get(s.season) }));

    // How far the program got each year. Distinct athletes per level, from
    // races a coach marked — an unmarked race is not "didn't qualify", and
    // the payload says which seasons have been marked at all so the screen
    // can tell those two apart.
    const postseason = countPostseason(
      results
        .filter((r) => r.athlete && r.race.postseasonLevel)
        .map((r) => ({
          athleteId: r.athleteId,
          gender: normalizeGender(r.athlete.gender),
          season: r.race.season,
          level: r.race.postseasonLevel,
        })),
      years
    );

    // The program's own best season, per metric — the only honest
    // yardstick available, since no league/state reference data exists.
    const bests = buildSelfBenchmarks(merged);

    res.json({
      success: true,
      seasons: merged,
      attrition,
      postseason,
      bests,
      story: buildProgramStory(shapes, attrition, bySeason, participants, { postseason, bests }),
    });
  } catch (err) {
    console.error('Error computing program analytics:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
