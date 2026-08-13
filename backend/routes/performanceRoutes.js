const express = require('express');
const calculationService = require('../services/performance/calculationService');
const cache = require('../services/performance/cache');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const prisma = require('../lib/db');
const { MILE_IN_METERS } = require('../lib/distance');

const router = express.Router();

/**
 * @route   POST /api/performance/calculate/:season
 * @desc    Calculate performance metrics for the caller's team/season
 * @access  Private (Coach)
 */
router.post('/calculate/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);
    const wait = String(req.query.wait || '').toLowerCase() === 'true';

    if (wait) {
      const result = await calculationService.calculateAllMetrics(teamId, season, true);
      return res.status(200).json({ success: true, message: 'Metrics calculation completed.', teamId, season, data: result });
    }

    calculationService
      .calculateAllMetrics(teamId, season)
      .catch((error) => logger.error(`Error in background calculation for team ${teamId}: ${error.message}`));

    return res.status(202).json({
      success: true,
      message: 'Metrics calculation started in the background. You can safely leave this page - check back in a few minutes.',
      teamId,
      season,
      calculationStatus: 'processing',
    });
  } catch (error) {
    logger.error(`Error starting metrics calculation: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to start metrics calculation' });
  }
});

/**
 * Multi-season trends for the caller's team, from pre-calculated season
 * metrics (faster, but only as fresh as the last calculation run — see
 * /api/multi-season/trends for the live-computed equivalent).
 */
router.get('/multi-season/trends', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const docs = await prisma.teamSeasonMetrics.findMany({
      where: { teamId },
      select: { season: true, averagePace: true, totalRaces: true },
      orderBy: { season: 'asc' },
    });

    const seasons = docs.map((d) => d.season);
    const trends = docs.map((d) => {
      const overallPace = d.averagePace || 0;
      const totalRaces = d.totalRaces || 0;
      const hasData = overallPace > 0 && totalRaces > 0;
      // Not the F1 bug (this converts an already-correct sec/mile pace into
      // a nominal 5K-equivalent display time, not raw time -> pace) — but
      // still a hardcoded 5K-in-miles literal, so sourced from the same
      // constant lib/distance.js exports rather than a bare magic number.
      const milesPer5k = 5000 / MILE_IN_METERS;
      const team5k = overallPace > 0 ? Math.round(overallPace * milesPer5k) : 0;

      return {
        season: d.season,
        avg5K: { girls: null, boys: null, team: hasData ? team5k : 0 },
        avgPace: { girls: null, boys: null, team: hasData ? overallPace : 0 },
        stateMeet: { avg5K: { girls: null, boys: null, team: 0 }, avgPace: { girls: null, boys: null, team: 0 }, hasData: false },
        hasData,
      };
    });

    res.json({ success: true, data: { seasons, trends } });
  } catch (error) {
    logger.error(`Error building multi-season trends: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to load multi-season trends' });
  }
});

/**
 * @route   GET /api/performance/team/season/:season/series
 * @desc    Meet-by-meet season series and trend for the caller's team
 */
router.get('/team/season/:season/series', authenticate, requireTeam, async (req, res) => {
  try {
    const data = await calculationService.getSeasonSeries(req.user.teamId, parseInt(req.params.season, 10));
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Error fetching season series: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch season series' });
  }
});

/**
 * @route   GET /api/performance/team/season/:season
 */
router.get('/team/season/:season', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const seasonNum = parseInt(req.params.season, 10);

    const cachedMetrics = await cache.getTeamMetrics(teamId, seasonNum);
    if (cachedMetrics) {
      return res.json({ success: true, data: cachedMetrics, cached: true });
    }

    const metrics = await calculationService.calculateTeamMetrics(teamId, seasonNum);
    if (!metrics) {
      return res.status(404).json({ success: false, message: 'No metrics found for the specified season' });
    }

    res.json({ success: true, data: metrics, cached: false });
  } catch (error) {
    logger.error(`Error fetching team metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch team metrics' });
  }
});

/**
 * @route   GET /api/performance/athlete/:athleteId/season/:season
 * Scoped: the athlete must belong to the caller's team.
 */
router.get('/athlete/:athleteId/season/:season', authenticate, requireTeam, async (req, res) => {
  try {
    const { athleteId } = req.params;
    const seasonNum = parseInt(req.params.season, 10);

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const cacheKey = `athlete:v2:${athleteId}:${seasonNum}`;
    const cachedMetrics = await cache.get(cacheKey);
    if (cachedMetrics) {
      return res.json({ success: true, data: cachedMetrics, cached: true });
    }

    const metrics = await prisma.athleteSeasonMetrics.findFirst({ where: { athleteId, season: seasonNum } });
    if (!metrics) {
      return res.status(404).json({ success: false, message: 'No metrics found for the specified athlete and season' });
    }

    let enriched = { ...metrics };
    try {
      const seasonRaces = await calculationService.getAthleteRacesSeasonOnly(athleteId, seasonNum);
      enriched.races = seasonRaces.map((r) => ({
        id: r._id || r.raceId || '',
        meetName: r.meetName,
        date: r.date,
        distance: Number(r.distance),
        time: Number(r.time),
      }));
      // best5kTime kept for backward compat (zero for a team that doesn't
      // race 5Ks); bestPaceSecPerMile is the real, distance-agnostic
      // primary metric — see calculationService.calculateAthleteRaceMetrics.
      enriched.best5kTime = metrics.bestTime5k || 0;
      enriched.bestPaceSecPerMile = metrics.bestPace || 0;
    } catch (err) {
      enriched.races = [];
      logger.warn(`Failed to attach season-only races for athlete ${athleteId}, season ${seasonNum}: ${err.message}`);
    }

    await cache.set(cacheKey, enriched);
    res.json({ success: true, data: enriched, cached: false });
  } catch (error) {
    logger.error(`Error fetching athlete metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch athlete metrics' });
  }
});

/**
 * @route   GET /api/performance/meet/:meetId
 */
router.get('/meet/:meetId', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { meetId } = req.params;
    const cacheKey = `meet:${meetId}:${teamId}`;

    const cachedMetrics = await cache.get(cacheKey);
    if (cachedMetrics) {
      return res.json({ success: true, data: cachedMetrics, cached: true });
    }

    const metrics = await prisma.meetPerformanceMetrics.findFirst({ where: { raceId: meetId, teamId } });
    if (!metrics) {
      return res.status(404).json({ success: false, message: 'No metrics found for the specified meet' });
    }

    await cache.set(cacheKey, metrics);
    res.json({ success: true, data: metrics, cached: false });
  } catch (error) {
    logger.error(`Error fetching meet metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch meet metrics' });
  }
});

/**
 * @route   POST /api/performance/cache/clear
 * @desc    Clear performance metrics cache for the caller's own team.
 * (The original checked for role === 'admin', a role that doesn't exist
 * anywhere else in this app — that endpoint was unreachable by anyone.
 * Scoping it to "coach of your own team" makes it both reachable and safe.)
 */
router.post('/cache/clear', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const { season } = req.body;
    const clearedCount = await cache.invalidateTeam(req.user.teamId, season || undefined);
    res.json({ success: true, message: `Successfully cleared ${clearedCount} cache entries`, clearedCount });
  } catch (error) {
    logger.error(`Error clearing cache: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to clear cache' });
  }
});

/**
 * @route   GET /api/performance/athlete/:athleteId/all-seasons
 * Scoped: the athlete must belong to the caller's team.
 */
router.get('/athlete/:athleteId/all-seasons', authenticate, requireTeam, async (req, res) => {
  try {
    const { athleteId } = req.params;

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const cacheKey = `athlete:${athleteId}:all-seasons`;
    const cachedMetrics = await cache.get(cacheKey);
    if (cachedMetrics) {
      return res.json({ success: true, data: cachedMetrics, cached: true });
    }

    const metrics = await prisma.athleteSeasonMetrics.findMany({
      where: { athleteId },
      orderBy: { season: 'asc' },
    });

    if (!metrics || metrics.length === 0) {
      return res.status(404).json({ success: false, message: 'No metrics found for the specified athlete across any season' });
    }

    const enrichedSeasons = await Promise.all(
      metrics.map(async (seasonMetric) => {
        let enriched = { ...seasonMetric };
        try {
          const races = await calculationService.getAthleteRacesSeasonOnly(athleteId, seasonMetric.season);
          enriched.races = races;
          enriched.best5kTime = seasonMetric.bestTime5k || 0;
          enriched.bestPaceSecPerMile = seasonMetric.bestPace || 0;
        } catch (err) {
          enriched.races = [];
          logger.warn(`Failed to attach races for athlete ${athleteId}, season ${seasonMetric.season}: ${err.message}`);
        }
        return enriched;
      })
    );

    const result = { success: true, athleteId, seasons: enrichedSeasons };
    await cache.set(cacheKey, result);
    res.json({ success: true, data: result, cached: false });
  } catch (error) {
    logger.error(`Error fetching all-seasons athlete metrics: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch all-seasons athlete metrics' });
  }
});

module.exports = router;
