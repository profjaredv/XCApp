const express = require('express');
const calculationService = require('../services/performance/calculationServiceSupabase');
const cache = require('../services/performance/cache');
const { authenticate, authorizeTeamAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');

// Helper to resolve team identifier from route (UUID or external team code like '460')
async function resolveTeamIdOrThrow(teamIdParam) {
  // Check if it's a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(teamIdParam)) return teamIdParam;

  // Try lookup by athletic_team_id
  const { data: team, error } = await supabase
    .from('teams')
    .select('id')
    .eq('athletic_team_id', teamIdParam)
    .single();

  if (error || !team) {
    const msg = `Team not found for identifier: ${teamIdParam}`;
    logger.warn(msg);
    const err = new Error(msg);
    err.status = 404;
    throw err;
  }
  return team.id;
}

const router = express.Router();

/**
 * @route   POST /api/performance/calculate/:teamId/:season
 * @desc    Calculate performance metrics for a team and season
 * @access  Private (Team Admin/Coach)
 */
router.post(
  '/calculate/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      logger.info(`Starting metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);

      const wait = String(req.query.wait || '').toLowerCase() === 'true';

      if (wait) {
        // Run synchronously and return computed metrics when done
        const result = await calculationService.calculateAllMetrics(resolvedTeamId, parseInt(season), /*skipCache*/ true);
        logger.info(`Completed (sync) metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);
        return res.status(200).json({
          success: true,
          message: 'Metrics calculation completed.',
          teamId: resolvedTeamId,
          season,
          data: result
        });
      } else {
        // Start calculation in background
        calculationService.calculateAllMetrics(resolvedTeamId, parseInt(season))
          .then(() => {
            logger.info(`Completed metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);
          })
          .catch(error => {
            logger.error(`Error in background calculation for team ${teamId}: ${error.message}`, { error });
          });
        
        // Return immediately with a 202 Accepted response
        return res.status(202).json({
          success: true,
          message: 'Metrics calculation started in the background. You can safely leave this page - check back in a few minutes.',
          teamId: resolvedTeamId,
          season,
          calculationStatus: 'processing'
        });
      }
      
    } catch (error) {
      logger.error(`Error starting metrics calculation: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to start metrics calculation',
        error: error.message
      });
    }
  }
);

/**
 * Multi-season trends for a team
 */
router.get(
  '/multi-season/team/:teamId/trends',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);

      // Get all seasons we have metrics for this team
      const { data: docs, error } = await supabase
        .from('team_season_metrics')
        .select('season, average_pace, total_races')
        .eq('team_id', resolvedTeamId)
        .order('season', { ascending: true });

      if (error) throw error;

      const seasons = (docs || []).map(d => d.season);
      const trends = (docs || []).map(d => {
        const overallPace = Number(d.average_pace || 0);
        const totalRaces = Number(d.total_races || 0);
        const hasData = overallPace > 0 && totalRaces > 0;
        const milesPer5k = 3.10686;
        const team5k = overallPace > 0 ? Math.round(overallPace * milesPer5k) : 0;

        return {
          season: d.season,
          avg5K: {
            girls: null,
            boys: null,
            team: hasData ? team5k : 0,
          },
          avgPace: {
            girls: null,
            boys: null,
            team: hasData ? overallPace : 0,
          },
          stateMeet: {
            avg5K: { girls: null, boys: null, team: 0 },
            avgPace: { girls: null, boys: null, team: 0 },
            hasData: false,
          },
          hasData,
        };
      });

      return res.json({ success: true, data: { seasons, trends } });
    } catch (error) {
      logger.error(`Error building multi-season trends: ${error.message}`, { error });
      return res.status(500).json({ success: false, message: 'Failed to load multi-season trends' });
    }
  }
);

/**
 * @route   GET /api/performance/team/:teamId/season/:season/series
 * @desc    Get meet-by-meet season series and trend for a team
 * @access  Private (Team Member)
 */
router.get(
  '/team/:teamId/season/:season/series',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const seasonNum = parseInt(season);
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);

      const data = await calculationService.getSeasonSeries(resolvedTeamId, seasonNum);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error fetching season series: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch season series',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/performance/team/:teamId/season/:season
 * @desc    Get performance metrics for a team and season
 * @access  Private (Team Member)
 */
router.get(
  '/team/:teamId/season/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const seasonNum = parseInt(season);
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      
      // Try to get from cache first
      const cachedMetrics = await cache.getTeamMetrics(resolvedTeamId, seasonNum);
      if (cachedMetrics) {
        return res.json({
          success: true,
          data: cachedMetrics,
          cached: true
        });
      }
      
      // If not in cache, calculate and return
      const metrics = await calculationService.calculateTeamMetrics(resolvedTeamId, seasonNum);
      
      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: 'No metrics found for the specified team and season'
        });
      }
      
      res.json({
        success: true,
        data: metrics,
        cached: false
      });
      
    } catch (error) {
      logger.error(`Error fetching team metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch team metrics',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/performance/athlete/:athleteId/season/:season
 * @desc    Get performance metrics for an athlete in a season
 * @access  Private (Team Member)
 */
// Get athlete metrics for a specific season
router.get(
  '/athlete/:athleteId/season/:season',
  authenticate,
  async (req, res) => {
    try {
      const { athleteId, season } = req.params;
      const seasonNum = parseInt(season);
      const cacheKey = `athlete:v2:${athleteId}:${seasonNum}`;
      
      // Try to get from cache first
      const cachedMetrics = await cache.get(cacheKey);
      if (cachedMetrics) {
        return res.json({
          success: true,
          data: cachedMetrics,
          cached: true
        });
      }
      
      // Get from database
      const { data: metrics, error: metricsError } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('season', seasonNum)
        .maybeSingle();

      if (metricsError || !metrics) {
        return res.status(404).json({
          success: false,
          message: 'No metrics found for the specified athlete and season'
        });
      }

      // Fetch season-only races
      let enriched = { ...metrics };
      try {
        const seasonRaces = await calculationService.getAthleteRacesSeasonOnly(athleteId, seasonNum);
        const races = (seasonRaces || []).map(r => ({
          id: r._id || r.raceId || '',
          meetName: r.meetName,
          date: r.date,
          distance: Number(r.distance),
          time: Number(r.time),
        }));

        enriched.races = races;
        enriched.best5kTime = metrics.best_time_5k || 0;
      } catch (err) {
        enriched.races = [];
        logger.warn(`Failed to attach season-only races for athlete ${athleteId}, season ${seasonNum}: ${err.message}`);
      }

      // Cache the enriched result for future requests
      await cache.set(cacheKey, enriched);
      
      res.json({
        success: true,
        data: enriched,
        cached: false
      });
      
    } catch (error) {
      logger.error(`Error fetching athlete metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch athlete metrics',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/performance/meet/:meetId/team/:teamId
 * @desc    Get performance metrics for a specific meet and team
 * @access  Private (Team Member)
 */
router.get(
  '/meet/:meetId/team/:teamId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { meetId, teamId } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      const cacheKey = `meet:${meetId}:${resolvedTeamId}`;
      
      // Try to get from cache first
      const cachedMetrics = await cache.get(cacheKey);
      if (cachedMetrics) {
        return res.json({
          success: true,
          data: cachedMetrics,
          cached: true
        });
      }
      
      // Get from database
      const { data: metrics, error: metricsError } = await supabase
        .from('meet_performance_metrics')
        .select('*')
        .eq('race_id', meetId)
        .eq('team_id', resolvedTeamId)
        .maybeSingle();

      if (metricsError || !metrics) {
        return res.status(404).json({
          success: false,
          message: 'No metrics found for the specified meet and team'
        });
      }
      
      // Cache the result for future requests
      await cache.set(cacheKey, metrics);
      
      res.json({
        success: true,
        data: metrics,
        cached: false
      });
      
    } catch (error) {
      logger.error(`Error fetching meet metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch meet metrics',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/performance/cache/clear
 * @desc    Clear performance metrics cache (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/cache/clear',
  authenticate,
  async (req, res) => {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to clear cache'
        });
      }
      
      const { teamId, season } = req.body;
      let clearedCount = 0;
      
      if (teamId && season) {
        // Clear cache for specific team/season
        clearedCount = await cache.invalidateTeam(teamId, season);
      } else if (teamId) {
        // Clear cache for all seasons of a team
        clearedCount = await cache.invalidateTeam(teamId);
      } else {
        // Clear all performance cache
        clearedCount = await cache.invalidateAll();
      }
      
      res.json({
        success: true,
        message: `Successfully cleared ${clearedCount} cache entries`,
        clearedCount
      });
      
    } catch (error) {
      logger.error(`Error clearing cache: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/performance/athlete/:athleteId/all-seasons
 * @desc    Get performance metrics for an athlete across all seasons
 * @access  Private (Team Member)
 */
router.get(
  '/athlete/:athleteId/all-seasons',
  authenticate,
  async (req, res) => {
    try {
      const { athleteId } = req.params;
      const cacheKey = `athlete:${athleteId}:all-seasons`;
      
      // Try to get from cache first
      const cachedMetrics = await cache.get(cacheKey);
      if (cachedMetrics) {
        return res.json({
          success: true,
          data: cachedMetrics,
          cached: true
        });
      }
      
      // Get from database
      const { data: metrics, error: metricsError } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('season', { ascending: true });

      logger.info(`Fetching all-seasons data for athlete ${athleteId}: found ${metrics?.length || 0} seasons`);

      if (metricsError) {
        logger.error(`Error fetching athlete metrics: ${metricsError.message}`);
        return res.status(500).json({
          success: false,
          message: 'Error fetching athlete metrics',
          error: metricsError.message
        });
      }

      if (!metrics || metrics.length === 0) {
        logger.warn(`No metrics found for athlete ${athleteId}`);
        return res.status(404).json({
          success: false,
          message: 'No metrics found for the specified athlete across any season'
        });
      }

      // Enrich with races for each season
      const enrichedSeasons = await Promise.all(metrics.map(async (seasonMetric) => {
        let enriched = { ...seasonMetric };
        const season = enriched.season;

        try {
          const races = await calculationService.getAthleteRacesSeasonOnly(athleteId, season);
          enriched.races = races;
          enriched.best5kTime = enriched.best_time_5k || 0;
          logger.info(`Attached ${races.length} races for athlete ${athleteId}, season ${season}`);
        } catch (err) {
          enriched.races = [];
          logger.warn(`Failed to attach races for athlete ${athleteId}, season ${season}: ${err.message}`);
        }

        return enriched;
      }));

      const result = {
        success: true,
        athleteId,
        seasons: enrichedSeasons
      };
      
      // Cache the enriched result for future requests
      await cache.set(cacheKey, result);
      
      res.json({
        success: true,
        data: result,
        cached: false
      });
      
    } catch (error) {
      logger.error(`Error fetching all-seasons athlete metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch all-seasons athlete metrics',
        error: error.message
      });
    }
  }
);

module.exports = router;
