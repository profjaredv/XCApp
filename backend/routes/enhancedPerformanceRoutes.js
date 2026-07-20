const express = require('express');
const calculationService = require('../services/performance/calculationServiceSupabase');
const { authenticate, authorizeTeamAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');

const router = express.Router();

// Note: Enhanced metrics are now part of the main calculationServiceSupabase
// This route file exists for backward compatibility but delegates to the main service

// Helper to resolve team identifier
async function resolveTeamIdOrThrow(teamId) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(teamId)) return teamId;

  const { data: team, error } = await supabase
    .from('teams')
    .select('id')
    .eq('athletic_team_id', teamId)
    .maybeSingle();

  if (error || !team) {
    const err = new Error(`Team not found: ${teamId}`);
    err.status = 404;
    throw err;
  }
  return team.id;
}

/**
 * @route   POST /api/enhanced-performance/calculate/:teamId/:season
 * @desc    Calculate enhanced performance metrics for a team and season
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
      logger.info(`Starting enhanced metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);

      const wait = String(req.query.wait || '').toLowerCase() === 'true';

      if (wait) {
        // Run synchronously and return computed metrics when done
        const result = await calculationService.calculateAllMetrics(
          resolvedTeamId,
          parseInt(season),
          /*skipCache*/ true
        );
        
        logger.info(`Completed (sync) enhanced metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);
        return res.status(200).json({
          success: true,
          message: 'Enhanced metrics calculation completed.',
          teamId: resolvedTeamId,
          season,
          data: result,
          athleteCount: result.athleteMetrics?.length || 0,
          raceCount: result.teamMetrics?.totalRaces || 0,
          totalMiles: result.teamMetrics?.totalMiles || 0
        });
      } else {
        // Start calculation in background
        calculationService.calculateAllMetrics(resolvedTeamId, parseInt(season))
          .then((result) => {
            logger.info(`Completed enhanced metrics calculation for team ${teamId} -> ${resolvedTeamId}, season ${season}`);
          })
          .catch((error) => {
            logger.error(`Error in background enhanced metrics calculation: ${error.message}`, { error });
          });

        return res.status(202).json({
          success: true,
          message: 'Enhanced metrics calculation started in background.',
          teamId: resolvedTeamId,
          season
        });
      }
    } catch (error) {
      logger.error(`Error starting enhanced metrics calculation: ${error.message}`, { error });
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to start enhanced metrics calculation'
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/athlete/:athleteId/:season
 * @desc    Get enhanced athlete metrics for a specific season
 * @access  Private (Team Member)
 */
router.get(
  '/athlete/:athleteId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { athleteId, season } = req.params;
      
      // Get athlete metrics from Supabase
      const { data: athleteMetrics, error } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('season', season.toString())
        .maybeSingle();
      
      if (error || !athleteMetrics) {
        return res.status(404).json({
          success: false,
          message: 'Athlete metrics not found for this season'
        });
      }
      
      res.json({
        success: true,
        data: athleteMetrics
      });
    } catch (error) {
      logger.error(`Error fetching enhanced athlete metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch enhanced athlete metrics'
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/team/:teamId/:season
 * @desc    Get enhanced team metrics for a specific season
 * @access  Private (Team Member)
 */
router.get(
  '/team/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      
      // Get team metrics from Supabase
      const { data: teamMetrics, error } = await supabase
        .from('team_season_metrics')
        .select('*')
        .eq('team_id', resolvedTeamId)
        .eq('season', season.toString())
        .maybeSingle();
      
      // If no stored metrics, return error indicating they need to be calculated first
      if (error || !teamMetrics) {
        logger.warn(`No team metrics found for team ${resolvedTeamId}, season ${season}`);
        return res.status(404).json({
          success: false,
          message: 'Team metrics not found. Data may need to be imported or calculated.',
          code: 'METRICS_NOT_FOUND'
        });
      }
      
      // Transform to match UI expectations (camelCase)
      const enhancedMetrics = {
        teamId: teamMetrics.team_id,
        season: teamMetrics.season,
        totalAthletes: teamMetrics.total_athletes,
        totalRaces: teamMetrics.total_races,
        totalMiles: teamMetrics.total_miles,
        avgMilePace: { overall: teamMetrics.average_pace },
        byGender: teamMetrics.by_gender || { men: { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 }, women: { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 } },
        byGrade: teamMetrics.by_grade || { grade9: { count: 0, avgPace: 0, bestTime: 0 }, grade10: { count: 0, avgPace: 0, bestTime: 0 }, grade11: { count: 0, avgPace: 0, bestTime: 0 }, grade12: { count: 0, avgPace: 0, bestTime: 0 } },
        byDistance: teamMetrics.by_distance || { oneMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 }, onePointFiveMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 }, threeMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 }, fiveK: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 } },
        teamDepth: teamMetrics.team_depth || { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 },
        packRunning: teamMetrics.pack_running || { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 }
      };
      
      res.json({
        success: true,
        data: enhancedMetrics,
        fromCache: !!teamMetrics
      });
    } catch (error) {
      logger.error(`Error fetching enhanced team metrics: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch enhanced team metrics'
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/multi-season-meets/:teamId
 * @desc    Get meets that appear in multiple seasons for team comparison
 * @access  Private (Team Member)
 */
router.get(
  '/multi-season-meets/:teamId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      logger.info(`=== Multi-season meets request ===`);
      logger.info(`Route teamId: ${teamId}`);
      logger.info(`User: ${req.user?.id}`);
      logger.info(`User team: ${JSON.stringify(req.user?.team)}`);
      logger.info(`User team_id: ${req.user?.team_id}`);
      
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      
      logger.info(`Fetching multi-season meets for team ${resolvedTeamId}`);
      
      // First, check if there are manual meet groups
      const { data: meetGroups, error: groupsError } = await supabase
        .from('meet_groups')
        .select(`
          id,
          group_name,
          meet_group_races (
            races (
              id,
              name,
              season
            )
          )
        `)
        .eq('team_id', resolvedTeamId);
      
      if (groupsError) {
        logger.error('Error fetching meet groups:', groupsError);
      }
      
      // If manual groups exist, use them
      if (meetGroups && meetGroups.length > 0) {
        logger.info(`Using ${meetGroups.length} manual meet groups`);
        
        const manualMeets = meetGroups
          .map(group => {
            const races = (group.meet_group_races || []).map(mgr => mgr.races).filter(Boolean);
            const seasons = [...new Set(races.map(r => r.season))].sort();
            
            // Only include groups with 2+ seasons
            if (seasons.length < 2) return null;
            
            return {
              meetName: group.group_name,
              alternateNames: [],
              seasons,
              raceIds: races.map(r => ({ id: r.id, season: r.season, name: r.name })),
              isManual: true
            };
          })
          .filter(Boolean);
        
        logger.info(`Found ${manualMeets.length} manual meet groups with 2+ seasons`);
        
        return res.json({
          success: true,
          data: manualMeets
        });
      }
      
      // Fall back to automatic fuzzy matching
      logger.info('No manual groups found, using automatic fuzzy matching');
      
      // Get all races for this team
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('id, name, season')
        .eq('team_id', resolvedTeamId)
        .order('name')
        .order('season');
      
      if (racesError) {
        logger.error('Error fetching races:', racesError);
        throw racesError;
      }
      
      // Normalize meet name for fuzzy matching
      const normalizeMeetName = (name) => {
        return name
          .toLowerCase()
          .replace(/invitational/gi, 'invite')
          .replace(/\binvite\b/gi, 'invite')
          .replace(/\bft\b\.?/gi, 'fort')
          .replace(/\bst\b\.?/gi, 'saint')
          .replace(/\bmt\b\.?/gi, 'mount')
          .replace(/[^a-z0-9\s]/g, '') // Remove special chars
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
      };
      
      // Group races by normalized name
      const racesByNormalizedName = new Map();
      const normalizedToOriginal = new Map(); // Track original names
      
      races.forEach(race => {
        const normalized = normalizeMeetName(race.name);
        
        if (!racesByNormalizedName.has(normalized)) {
          racesByNormalizedName.set(normalized, []);
          normalizedToOriginal.set(normalized, []);
        }
        
        racesByNormalizedName.get(normalized).push(race);
        
        // Track all original names for this normalized version
        const originals = normalizedToOriginal.get(normalized);
        if (!originals.includes(race.name)) {
          originals.push(race.name);
        }
      });
      
      // Filter to only races that appear in 2+ seasons
      const multiSeasonMeets = Array.from(racesByNormalizedName.entries())
        .filter(([_, raceList]) => {
          const seasons = new Set(raceList.map(r => r.season));
          return seasons.size >= 2;
        })
        .map(([normalized, raceList]) => {
          // Use the most common or most recent name as the display name
          const originalNames = normalizedToOriginal.get(normalized);
          const mostRecentRace = raceList.sort((a, b) => b.season - a.season)[0];
          
          return {
            meetName: mostRecentRace.name, // Use most recent name
            alternateNames: originalNames.filter(n => n !== mostRecentRace.name),
            seasons: [...new Set(raceList.map(r => r.season))].sort(),
            raceIds: raceList.map(r => ({ id: r.id, season: r.season, name: r.name }))
          };
        });
      
      logger.info(`Found ${multiSeasonMeets.length} meets that appear in multiple seasons`);
      
      res.json({
        success: true,
        data: multiSeasonMeets
      });
    } catch (error) {
      logger.error(`Error fetching multi-season meets: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch multi-season meets',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/eligible-athletes/:teamId
 * @desc    Get list of athletes eligible for comparison (non-freshmen)
 * @access  Private (Team Member)
 */
router.get(
  '/eligible-athletes/:teamId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      
      logger.info(`Fetching eligible athletes for team ${resolvedTeamId}`);
      
      // Get all athletes for this team, excluding 9th graders
      const { data: athletes, error: athletesError } = await supabase
        .from('athletes')
        .select('id, name, grade, gender')
        .eq('team_id', resolvedTeamId)
        .neq('grade', '9')
        .order('name');
      
      if (athletesError) {
        logger.error('Error fetching athletes:', athletesError);
        throw athletesError;
      }
      
      res.json({
        success: true,
        data: athletes || []
      });
    } catch (error) {
      logger.error(`Error fetching eligible athletes: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch eligible athletes',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/meet-comparison/:teamId/:meetName
 * @desc    Get team performance at a specific meet across seasons
 * @access  Private (Team Member)
 */
router.get(
  '/meet-comparison/:teamId/:meetName',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, meetName } = req.params;
      logger.info(`=== Meet Comparison Request ===`);
      logger.info(`Route teamId param: ${teamId}`);
      logger.info(`Meet name param: ${meetName}`);
      
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      const decodedMeetName = decodeURIComponent(meetName);
      
      logger.info(`Resolved teamId: ${resolvedTeamId}`);
      logger.info(`Decoded meet name: ${decodedMeetName}`);
      
      // Check if this is a manual meet group
      const { data: meetGroup, error: groupError } = await supabase
        .from('meet_groups')
        .select(`
          id,
          group_name,
          meet_group_races (
            races (
              id,
              season,
              date,
              name
            )
          )
        `)
        .eq('team_id', resolvedTeamId)
        .eq('group_name', decodedMeetName)
        .maybeSingle();
      
      let races;
      
      if (meetGroup && meetGroup.meet_group_races) {
        // Manual group found - use the races from the group
        logger.info(`Using manual meet group: ${decodedMeetName}`);
        races = meetGroup.meet_group_races
          .map(mgr => mgr.races)
          .filter(Boolean)
          .sort((a, b) => a.season - b.season);
      } else {
        // No manual group - fall back to name matching
        logger.info(`Using name-based matching for: ${decodedMeetName}`);
        const { data: nameMatchedRaces, error: racesError } = await supabase
          .from('races')
          .select('id, season, date, name')
          .eq('team_id', resolvedTeamId)
          .eq('name', decodedMeetName)
          .order('season');
        
        if (racesError) {
          logger.error('Error fetching races:', racesError);
          throw racesError;
        }
        
        races = nameMatchedRaces;
      }
      
      logger.info(`Found ${races?.length || 0} races for comparison`);
      
      if (!races || races.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }
      
      // For each race, get team stats broken down by gender
      const seasonStats = await Promise.all(races.map(async (race) => {
        // Get all results for this race from this team
        const { data: results, error: resultsError } = await supabase
          .from('results')
          .select(`
            time,
            place,
            athlete:athletes!inner(gender)
          `)
          .eq('race_id', race.id)
          .eq('team_id', resolvedTeamId)
          .gt('time', 0);
        
        if (resultsError || !results || results.length === 0) {
          return null;
        }
        
        // Calculate stats for boys, girls, and overall
        // Handle multiple gender value formats (M/Male/Boys, F/Female/Girls)
        if (results.length > 0) {
          logger.info(`Sample gender values from race results: ${results.slice(0, 3).map(r => r.athlete.gender).join(', ')}`);
          logger.info(`All unique gender values: ${[...new Set(results.map(r => r.athlete.gender))].join(', ')}`);
        }
        
        const boys = results.filter(r => r.athlete.gender === 'M' || r.athlete.gender === 'Male' || r.athlete.gender === 'Boys' || r.athlete.gender === 'Men');
        const girls = results.filter(r => r.athlete.gender === 'F' || r.athlete.gender === 'Female' || r.athlete.gender === 'Girls' || r.athlete.gender === 'Women');
        
        logger.info(`Filtered results - Total: ${results.length}, Boys: ${boys.length}, Girls: ${girls.length}`);
        
        const calculateStats = (resultSet) => {
          if (resultSet.length === 0) return null;
          const times = resultSet.map(r => r.time).sort((a, b) => a - b);
          const places = resultSet.map(r => r.place);
          const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
          const avgPace = avgTime / 3.10686; // Assuming 5K distance, convert to per-mile pace
          const fastestTime = times[0]; // Already sorted
          
          // Calculate top 10 average (or all if less than 10)
          const top10Times = times.slice(0, Math.min(10, times.length));
          const top10AvgTime = top10Times.reduce((sum, t) => sum + t, 0) / top10Times.length;
          const top10AvgPace = top10AvgTime / 3.10686;
          
          // Calculate average place
          const avgPlace = places.length > 0 
            ? places.reduce((sum, p) => sum + p, 0) / places.length 
            : null;
          
          return {
            count: resultSet.length,
            avgTime,
            avgPace,
            avgPlace,
            fastestTime,
            top10AvgTime,
            top10AvgPace,
            top10Count: top10Times.length
          };
        };
        
        return {
          season: race.season,
          raceDate: race.date,
          boys: calculateStats(boys),
          girls: calculateStats(girls),
          team: calculateStats(results)
        };
      }));
      
      // Filter out null results
      const validSeasons = seasonStats.filter(s => s !== null).sort((a, b) => a.season - b.season);
      
      res.json({
        success: true,
        data: {
          meetName: decodedMeetName,
          seasons: validSeasons
        }
      });
    } catch (error) {
      logger.error(`Error fetching meet comparison: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch meet comparison',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/meet-athlete/:teamId/:meetName/:athleteId
 * @desc    Get athlete performance at a specific meet across seasons
 * @access  Private (Team Member)
 */
router.get(
  '/meet-athlete/:teamId/:meetName/:athleteId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, meetName, athleteId } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      const decodedMeetName = decodeURIComponent(meetName);
      
      logger.info(`Fetching athlete ${athleteId} performance at ${decodedMeetName}`);
      
      // Get all races with this name for this team
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('id, season, date')
        .eq('team_id', resolvedTeamId)
        .eq('name', decodedMeetName)
        .order('season');
      
      if (racesError) {
        logger.error('Error fetching races:', racesError);
        throw racesError;
      }
      
      // For each race, get this athlete's result
      const athleteResults = await Promise.all(races.map(async (race) => {
        const { data: result, error: resultError } = await supabase
          .from('results')
          .select('time, place')
          .eq('race_id', race.id)
          .eq('athlete_id', athleteId)
          .maybeSingle();
        
        if (resultError || !result) {
          return null;
        }
        
        const pace = result.time / 3.10686; // Assuming 5K
        
        return {
          season: race.season,
          raceDate: race.date,
          time: result.time,
          pace,
          place: result.place
        };
      }));
      
      // Filter out null results (seasons where athlete didn't run)
      const validResults = athleteResults.filter(r => r !== null).sort((a, b) => a.season - b.season);
      
      res.json({
        success: true,
        data: {
          athleteId,
          meetName: decodedMeetName,
          results: validResults
        }
      });
    } catch (error) {
      logger.error(`Error fetching athlete meet performance: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch athlete meet performance',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/athlete-progression/:athleteId
 * @desc    Get multi-season progression for an individual athlete
 * @access  Private (Team Member)
 */
router.get(
  '/athlete-progression/:athleteId',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { athleteId } = req.params;
      
      logger.info(`Fetching progression for athlete ${athleteId}`);
      
      // Get athlete details
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .select('id, name, gender, grade, team_id')
        .eq('id', athleteId)
        .maybeSingle();
      
      if (athleteError || !athlete) {
        return res.status(404).json({
          success: false,
          message: 'Athlete not found'
        });
      }
      
      // Get all season metrics for this athlete
      const { data: metrics, error: metricsError } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('season');
      
      if (metricsError) {
        logger.error('Error fetching athlete metrics:', metricsError);
        throw metricsError;
      }
      
      if (!metrics || metrics.length === 0) {
        return res.json({
          success: true,
          data: {
            athleteId: athlete.id,
            athleteName: athlete.name,
            gender: athlete.gender,
            currentGrade: athlete.grade,
            seasons: []
          }
        });
      }
      
      // Build season progression data
      const seasons = metrics.map((m, index) => {
        const timeImprovement = index > 0 
          ? m.best_time_5k - metrics[index - 1].best_time_5k 
          : undefined;
        
        return {
          season: m.season,
          grade: m.grade || '',
          raceCount: m.total_races || 0,
          avgTime: m.average_time || 0,
          avgPace: m.average_pace || 0,
          bestTime: m.best_time_5k || 0,
          timeImprovement
        };
      });
      
      res.json({
        success: true,
        data: {
          athleteId: athlete.id,
          athleteName: athlete.name,
          gender: athlete.gender,
          currentGrade: athlete.grade,
          seasons
        }
      });
    } catch (error) {
      logger.error(`Error fetching athlete progression: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch athlete progression',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/enhanced-performance/distance-analysis/:teamId/:season
 * @desc    Get distance-specific analysis for a team and season
 * @access  Private (Team Member)
 */
router.get(
  '/distance-analysis/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const resolvedTeamId = await resolveTeamIdOrThrow(teamId);
      
      // Get team metrics with distance breakdown
      const { data: teamMetrics } = await supabase
        .from('team_season_metrics')
        .select('*')
        .eq('team_id', resolvedTeamId)
        .eq('season', season.toString())
        .maybeSingle();
      
      if (!teamMetrics) {
        return res.status(404).json({
          success: false,
          message: 'Team metrics not found. Please calculate metrics first.'
        });
      }
      
      // Get athlete metrics - for now, return empty array for athletes
      // (Full per-athlete distance breakdown would require additional calculations)
      const distanceAnalysis = {
        team: teamMetrics.by_distance || {
          oneMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
          onePointFiveMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
          threeMile: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 },
          fiveK: { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 }
        },
        athletes: [] // TODO: Implement per-athlete distance breakdown
      };
      
      res.json({
        success: true,
        data: distanceAnalysis
      });
    } catch (error) {
      logger.error(`Error fetching distance analysis: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch distance analysis'
      });
    }
  }
);

module.exports = router;
