const express = require('express');
const { authenticate, authorizeTeamAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../config/supabase');

const router = express.Router();

/**
 * Helper to convert meters to miles
 */
const toMiles = (meters) => meters > 0 ? meters / 1609.34 : 0;

/**
 * Helper to parse distance in miles from race data
 */
const parseDistanceMiles = (race) => {
  const meters = race?.distance_meters || 0;
  if (meters > 0) return toMiles(meters);

  const label = (race?.distance || '').toLowerCase();
  if (label.includes('5k') || label.includes('5 k')) return 3.1;
  if (label.includes('3k') || label.includes('3 k')) return 1.86;
  if (label.includes('2 mile')) return 2;
  if (label.includes('1 mile') || label === 'mile') return 1;

  const numMatch = label.match(/^(\d+(?:\.\d+)?)\s*(?:mile|mi|m|k|km|meter|meters)?/i);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);
    if (label.includes('k') || label.includes('km')) {
      return value * 0.621371;
    }
    return value;
  }

  return 0;
};

/**
 * @route   GET /api/multi-season/team/:teamId/trends
 * @desc    Get multi-season trend data for a team
 * @access  Private (Team Member)
 */
router.get(
  '/team/:teamId/trends',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      // Get all distinct seasons for this team
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('season')
        .eq('team_id', teamId);

      if (racesError) throw racesError;

      const seasons = [...new Set((races || []).map(r => parseInt(r.season)))]
        .filter(s => !isNaN(s))
        .sort((a, b) => a - b);

      if (!seasons.length) {
        return res.json({ success: true, data: { seasons: [], trends: [] } });
      }

      const multiSeasonData = await Promise.all(seasons.map(async (season) => {
        const seasonStr = String(season);

        // Get all races for this season
        const { data: seasonRaces } = await supabase
          .from('races')
          .select('*')
          .eq('team_id', teamId)
          .eq('season', seasonStr);

        if (!seasonRaces || seasonRaces.length === 0) {
          return {
            season,
            avg5K: { girls: null, boys: null, team: null },
            avgPace: { girls: null, boys: null, team: null },
            stateMeet: { avg5K: { girls: null, boys: null, team: null }, avgPace: { girls: null, boys: null, team: null }, hasData: false },
            hasData: false,
          };
        }

        const raceIds = seasonRaces.map(race => race.id);

        // Get all results for these races with athlete data
        const { data: results } = await supabase
          .from('results')
          .select(`
            *,
            athlete:athletes(id, name, gender, grade),
            race:races(*)
          `)
          .in('race_id', raceIds)
          .gt('time', 0);

        if (!results || results.length === 0) {
          return {
            season,
            avg5K: { girls: null, boys: null, team: null },
            avgPace: { girls: null, boys: null, team: null },
            stateMeet: { avg5K: { girls: null, boys: null, team: null }, avgPace: { girls: null, boys: null, team: null }, hasData: false },
            hasData: false,
          };
        }

        // Filter for valid results (exclude state meets)
        const validResults = results.filter(result => {
          const race = result.race;
          const isStateMeet = race?.name && /state|championship/i.test(race.name);
          return !isStateMeet && result.time > 0;
        });

        // Calculate pace for each result (seconds per mile)
        const resultsWithPace = validResults.map(result => {
          const race = result.race;
          const distanceMiles = parseDistanceMiles(race);
          const pace = distanceMiles > 0 ? result.time / distanceMiles : 0;

          return { ...result, pace, distanceMiles };
        }).filter(r => r.pace > 0 && r.pace < 1800); // Filter out unrealistic paces

        // Filter by gender - handle both 'M'/'F' and 'Men'/'Women' formats
        const girls = resultsWithPace.filter(r => {
          const gender = r.athlete?.gender;
          return gender === 'F' || gender === 'Women';
        });
        const boys = resultsWithPace.filter(r => {
          const gender = r.athlete?.gender;
          return gender === 'M' || gender === 'Men';
        });

        // Calculate average pace (seconds per mile)
        const avgPace = (arr) => arr.length ? arr.reduce((s, r) => s + r.pace, 0) / arr.length : 0;
        const teamAvgPace = avgPace(resultsWithPace);
        const girlsAvgPace = avgPace(girls);
        const boysAvgPace = avgPace(boys);

        // Convert pace to 5K time (pace * 3.1 miles)
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
      }));

      return res.json({ success: true, data: { seasons, trends: multiSeasonData } });
    } catch (error) {
      logger.error(`Error fetching multi-season trends: ${error.message}`, { error });
      res.status(500).json({ success: false, message: 'Failed to fetch multi-season trends', error: error.message });
    }
  }
);

module.exports = router;
