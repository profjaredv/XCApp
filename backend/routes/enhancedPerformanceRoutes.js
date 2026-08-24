const express = require('express');
const calculationService = require('../services/performance/calculationService');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const prisma = require('../lib/db');
const { paceSecPerMile } = require('../lib/groupAnalytics');

const router = express.Router();

// Note: Enhanced metrics are part of the main calculationService.
// This route file exists for backward compatibility with the frontend's
// "enhanced" views but delegates to the main service.

/**
 * @route   POST /api/enhanced-performance/calculate/:season
 */
router.post('/calculate/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);
    const wait = String(req.query.wait || '').toLowerCase() === 'true';

    if (wait) {
      const result = await calculationService.calculateAllMetrics(teamId, season, true);
      return res.status(200).json({
        success: true,
        message: 'Enhanced metrics calculation completed.',
        teamId,
        season,
        data: result,
      });
    }

    calculationService
      .calculateAllMetrics(teamId, season)
      .catch((error) => logger.error(`Error in background enhanced metrics calculation: ${error.message}`));

    return res.status(202).json({ success: true, message: 'Enhanced metrics calculation started in background.', teamId, season });
  } catch (error) {
    logger.error(`Error starting enhanced metrics calculation: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to start enhanced metrics calculation' });
  }
});

/**
 * @route   GET /api/enhanced-performance/athlete/:athleteId/:season
 */
router.get('/athlete/:athleteId/:season', authenticate, requireTeam, async (req, res) => {
  try {
    const { athleteId, season } = req.params;

    const athleteMetrics = await prisma.athleteSeasonMetrics.findFirst({
      where: { athleteId, teamId: req.user.teamId, season: parseInt(season, 10) },
    });

    if (!athleteMetrics) {
      return res.status(404).json({ success: false, message: 'Athlete metrics not found for this season' });
    }

    res.json({ success: true, data: athleteMetrics });
  } catch (error) {
    logger.error(`Error fetching enhanced athlete metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch enhanced athlete metrics' });
  }
});

/**
 * @route   GET /api/enhanced-performance/team/:season
 */
router.get('/team/:season', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);

    const teamMetrics = await prisma.teamSeasonMetrics.findUnique({ where: { teamId_season: { teamId, season } } });

    if (!teamMetrics) {
      return res.status(404).json({
        success: false,
        message: 'Team metrics not found. Data may need to be imported or calculated.',
        code: 'METRICS_NOT_FOUND',
      });
    }

    const enhancedMetrics = {
      teamId: teamMetrics.teamId,
      season: teamMetrics.season,
      totalAthletes: teamMetrics.athleteCount,
      totalRaces: teamMetrics.totalRaces,
      totalMiles: teamMetrics.totalMiles,
      avgMilePace: { overall: teamMetrics.averagePace },
      byGender: teamMetrics.byGender || {
        men: { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 },
        women: { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 },
      },
      byGrade: teamMetrics.byGrade || {
        grade9: { count: 0, avgPace: 0, bestTime: 0 },
        grade10: { count: 0, avgPace: 0, bestTime: 0 },
        grade11: { count: 0, avgPace: 0, bestTime: 0 },
        grade12: { count: 0, avgPace: 0, bestTime: 0 },
      },
      byGradeGender: teamMetrics.byGradeGender || {
        grade9: { M: { count: 0, avgPace: 0, bestTime: 0 }, F: { count: 0, avgPace: 0, bestTime: 0 } },
        grade10: { M: { count: 0, avgPace: 0, bestTime: 0 }, F: { count: 0, avgPace: 0, bestTime: 0 } },
        grade11: { M: { count: 0, avgPace: 0, bestTime: 0 }, F: { count: 0, avgPace: 0, bestTime: 0 } },
        grade12: { M: { count: 0, avgPace: 0, bestTime: 0 }, F: { count: 0, avgPace: 0, bestTime: 0 } },
      },
      byDistance: teamMetrics.byDistance || {
        oneMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        onePointFiveMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        threeMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        fiveK: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
      },
      teamDepth: teamMetrics.teamDepth || { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 },
      packRunning: teamMetrics.packRunning || { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 },
      fieldStanding: teamMetrics.fieldStanding || {
        men: { avgTeamScore: null, scoredDivisionCount: 0, top20Percent: null, top50Percent: null, totalWithFieldData: 0 },
        women: { avgTeamScore: null, scoredDivisionCount: 0, top20Percent: null, top50Percent: null, totalWithFieldData: 0 },
      },
    };

    res.json({ success: true, data: enhancedMetrics });
  } catch (error) {
    logger.error(`Error fetching enhanced team metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch enhanced team metrics' });
  }
});

/**
 * @route   GET /api/enhanced-performance/multi-season-meets
 */
router.get('/multi-season-meets', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;

    const meetGroups = await prisma.meetGroup.findMany({
      where: { teamId },
      include: { races: { include: { race: { select: { id: true, name: true, season: true } } } } },
    });

    if (meetGroups.length > 0) {
      const manualMeets = meetGroups
        .map((group) => {
          const races = group.races.map((mgr) => mgr.race).filter(Boolean);
          const seasons = [...new Set(races.map((r) => r.season))].sort();
          if (seasons.length < 2) return null;

          return {
            meetName: group.groupName,
            alternateNames: [],
            seasons,
            raceIds: races.map((r) => ({ id: r.id, season: r.season, name: r.name })),
            isManual: true,
          };
        })
        .filter(Boolean);

      return res.json({ success: true, data: manualMeets });
    }

    // No manual groups — fall back to automatic fuzzy matching by name.
    const races = await prisma.race.findMany({
      where: { teamId },
      select: { id: true, name: true, season: true },
      orderBy: [{ name: 'asc' }, { season: 'asc' }],
    });

    const normalizeMeetName = (name) =>
      name
        .toLowerCase()
        .replace(/invitational/gi, 'invite')
        .replace(/\binvite\b/gi, 'invite')
        .replace(/\bft\b\.?/gi, 'fort')
        .replace(/\bst\b\.?/gi, 'saint')
        .replace(/\bmt\b\.?/gi, 'mount')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const racesByNormalizedName = new Map();
    const normalizedToOriginal = new Map();

    races.forEach((race) => {
      const normalized = normalizeMeetName(race.name);
      if (!racesByNormalizedName.has(normalized)) {
        racesByNormalizedName.set(normalized, []);
        normalizedToOriginal.set(normalized, []);
      }
      racesByNormalizedName.get(normalized).push(race);
      const originals = normalizedToOriginal.get(normalized);
      if (!originals.includes(race.name)) originals.push(race.name);
    });

    const multiSeasonMeets = Array.from(racesByNormalizedName.entries())
      .filter(([, raceList]) => new Set(raceList.map((r) => r.season)).size >= 2)
      .map(([normalized, raceList]) => {
        const originalNames = normalizedToOriginal.get(normalized);
        const mostRecentRace = [...raceList].sort((a, b) => b.season - a.season)[0];

        return {
          meetName: mostRecentRace.name,
          alternateNames: originalNames.filter((n) => n !== mostRecentRace.name),
          seasons: [...new Set(raceList.map((r) => r.season))].sort(),
          raceIds: raceList.map((r) => ({ id: r.id, season: r.season, name: r.name })),
        };
      });

    res.json({ success: true, data: multiSeasonMeets });
  } catch (error) {
    logger.error(`Error fetching multi-season meets: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch multi-season meets' });
  }
});

/**
 * @route   GET /api/enhanced-performance/eligible-athletes
 * @desc    Athletes eligible for comparison (non-freshmen)
 */
router.get('/eligible-athletes', authenticate, requireTeam, async (req, res) => {
  try {
    const athletes = await prisma.athlete.findMany({
      where: { teamId: req.user.teamId, grade: { not: 9 } },
      select: { id: true, name: true, preferredName: true, grade: true, gender: true },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: athletes });
  } catch (error) {
    logger.error(`Error fetching eligible athletes: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch eligible athletes' });
  }
});

/**
 * @route   GET /api/enhanced-performance/meet-comparison/:meetName
 */
router.get('/meet-comparison/:meetName', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const decodedMeetName = decodeURIComponent(req.params.meetName);

    const meetGroup = await prisma.meetGroup.findFirst({
      where: { teamId, groupName: decodedMeetName },
      include: { races: { include: { race: true } } },
    });

    let races;
    if (meetGroup) {
      races = meetGroup.races.map((mgr) => mgr.race).filter(Boolean).sort((a, b) => a.season - b.season);
    } else {
      races = await prisma.race.findMany({
        where: { teamId, name: decodedMeetName },
        orderBy: { season: 'asc' },
      });
    }

    if (!races || races.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const seasonStats = await Promise.all(
      races.map(async (race) => {
        const results = await prisma.result.findMany({
          where: { raceId: race.id, teamId, status: 'FINISHED', time: { gt: 0 } },
          select: { time: true, place: true, athlete: { select: { gender: true } } },
        });

        if (results.length === 0) return null;

        const boys = results.filter((r) => ['M', 'Male', 'Boys', 'Men'].includes(r.athlete?.gender));
        const girls = results.filter((r) => ['F', 'Female', 'Girls', 'Women'].includes(r.athlete?.gender));

        // F1 fix: was avgTime / 3.10686 (assumed 5K). Every result here is
        // from this one `race`, so its real distanceMeters applies to all
        // of them — paceSecPerMile(avgTime, race.distanceMeters) instead.
        const calculateStats = (resultSet) => {
          if (resultSet.length === 0) return null;
          const times = resultSet.map((r) => r.time).sort((a, b) => a - b);
          const places = resultSet.map((r) => r.place).filter((p) => p != null);
          const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
          const avgPace = paceSecPerMile(avgTime, race.distanceMeters);
          const fastestTime = times[0];

          const top10Times = times.slice(0, Math.min(10, times.length));
          const top10AvgTime = top10Times.reduce((sum, t) => sum + t, 0) / top10Times.length;
          const top10AvgPace = paceSecPerMile(top10AvgTime, race.distanceMeters);

          const avgPlace = places.length > 0 ? places.reduce((sum, p) => sum + p, 0) / places.length : null;

          return { count: resultSet.length, avgTime, avgPace, avgPlace, fastestTime, top10AvgTime, top10AvgPace, top10Count: top10Times.length };
        };

        return { season: race.season, raceDate: race.date, boys: calculateStats(boys), girls: calculateStats(girls), team: calculateStats(results) };
      })
    );

    const validSeasons = seasonStats.filter((s) => s !== null).sort((a, b) => a.season - b.season);

    res.json({ success: true, data: { meetName: decodedMeetName, seasons: validSeasons } });
  } catch (error) {
    logger.error(`Error fetching meet comparison: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch meet comparison' });
  }
});

/**
 * @route   GET /api/enhanced-performance/meet-athlete/:meetName/:athleteId
 */
router.get('/meet-athlete/:meetName/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { athleteId } = req.params;
    const decodedMeetName = decodeURIComponent(req.params.meetName);

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const races = await prisma.race.findMany({
      where: { teamId, name: decodedMeetName },
      select: { id: true, season: true, date: true, distanceMeters: true },
      orderBy: { season: 'asc' },
    });

    const athleteResults = await Promise.all(
      races.map(async (race) => {
        const result = await prisma.result.findFirst({
          where: { raceId: race.id, athleteId, status: 'FINISHED' },
          select: { time: true, place: true },
        });
        if (!result) return null;
        // F1 fix: was result.time / 3.10686 (assumed 5K) regardless of
        // this meet's actual distance in a given season.
        return { season: race.season, raceDate: race.date, time: result.time, pace: paceSecPerMile(result.time, race.distanceMeters), place: result.place };
      })
    );

    const validResults = athleteResults.filter((r) => r !== null).sort((a, b) => a.season - b.season);

    res.json({ success: true, data: { athleteId, meetName: decodedMeetName, results: validResults } });
  } catch (error) {
    logger.error(`Error fetching athlete meet performance: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch athlete meet performance' });
  }
});

/**
 * @route   GET /api/enhanced-performance/athlete-progression/:athleteId
 * Scoped: the athlete must belong to the caller's team.
 */
router.get('/athlete-progression/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const { athleteId } = req.params;

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const metrics = await prisma.athleteSeasonMetrics.findMany({ where: { athleteId }, orderBy: { season: 'asc' } });

    if (metrics.length === 0) {
      return res.json({
        success: true,
        data: { athleteId: athlete.id, athleteName: athlete.preferredName || athlete.name, gender: athlete.gender, currentGrade: athlete.grade, seasons: [] },
      });
    }

    const seasons = metrics.map((m, index) => {
      const timeImprovement = index > 0 ? m.bestTime5k - metrics[index - 1].bestTime5k : undefined;
      return {
        season: m.season,
        grade: m.grade || '',
        raceCount: m.totalRaces || 0,
        avgPace: m.averagePace || 0,
        bestTime: m.bestTime5k || 0,
        timeImprovement,
      };
    });

    res.json({ success: true, data: { athleteId: athlete.id, athleteName: athlete.preferredName || athlete.name, gender: athlete.gender, currentGrade: athlete.grade, seasons } });
  } catch (error) {
    logger.error(`Error fetching athlete progression: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch athlete progression' });
  }
});

/**
 * @route   GET /api/enhanced-performance/distance-analysis/:season
 */
router.get('/distance-analysis/:season', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);

    const teamMetrics = await prisma.teamSeasonMetrics.findUnique({ where: { teamId_season: { teamId, season } } });

    if (!teamMetrics) {
      return res.status(404).json({ success: false, message: 'Team metrics not found. Please calculate metrics first.' });
    }

    // Per-athlete breakdown is computed live (not cached alongside
    // teamMetrics) — this page loads rarely enough that the extra query
    // isn't worth a schema change + recompute step to persist it.
    const athletes = await calculationService.calculateAthleteDistanceBreakdown(teamId, season);

    const distanceAnalysis = {
      team: teamMetrics.byDistance || {
        oneMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        onePointFiveMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        threeMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
        fiveK: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
      },
      athletes,
    };

    res.json({ success: true, data: distanceAnalysis });
  } catch (error) {
    logger.error(`Error fetching distance analysis: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch distance analysis' });
  }
});

module.exports = router;
