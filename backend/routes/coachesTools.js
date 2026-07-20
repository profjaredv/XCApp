const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, authorizeTeamAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCRFETAy65wsvX1YyLA2oRZQYSRu3P2Eso');

// Cache for AI results (24 hour TTL)
const trainingGroupsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @route   GET /api/coaches-tools/athlete-performance/:teamId/:season
 * @desc    Get athlete performance data for current season
 * @access  Private (Coach only)
 */
router.get(
  '/athlete-performance/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      
      logger.info(`Fetching athlete performance for team ${teamId}, season ${season}`);
      
      // Get all athletes for this team
      const { data: athletes, error: athletesError } = await supabase
        .from('athletes')
        .select('id, name, grade, gender')
        .eq('team_id', teamId);
      
      if (athletesError) throw athletesError;
      
      // For each athlete, get their last 3 races from this season
      const athletePerformance = await Promise.all(
        athletes.map(async (athlete) => {
          const { data: results, error: resultsError } = await supabase
            .from('results')
            .select(`
              id,
              time,
              place,
              race:races!inner (
                id,
                name,
                date,
                season
              )
            `)
            .eq('athlete_id', athlete.id)
            .eq('team_id', teamId)
            .eq('race.season', season)
            .gt('time', 0)
            .order('race.date', { ascending: false })
            .limit(3);
          
          if (resultsError) {
            logger.error(`Error fetching results for athlete ${athlete.id}:`, resultsError);
            return null;
          }
          
          // Calculate improvement metrics
          const races = results || [];
          let meetOverMeetImprovement = null;
          let seasonImprovement = null;
          
          if (races.length >= 2) {
            const mostRecent = races[0];
            const previous = races[1];
            const first = races[races.length - 1];
            
            // Meet-over-meet: (previous - current) / previous * 100
            meetOverMeetImprovement = ((previous.time - mostRecent.time) / previous.time) * 100;
            
            // Season: (first - current) / first * 100
            seasonImprovement = ((first.time - mostRecent.time) / first.time) * 100;
          }
          
          return {
            athlete: {
              id: athlete.id,
              name: athlete.name,
              grade: athlete.grade,
              gender: athlete.gender
            },
            races: races.map(r => ({
              id: r.id,
              time: r.time,
              place: r.place,
              raceName: r.race.name,
              raceDate: r.race.date
            })),
            metrics: {
              meetOverMeetImprovement,
              seasonImprovement,
              avgTime: races.length > 0 
                ? races.reduce((sum, r) => sum + r.time, 0) / races.length 
                : null,
              raceCount: races.length
            }
          };
        })
      );
      
      // Filter out athletes with no races
      const validAthletes = athletePerformance.filter(a => a && a.races.length > 0);
      
      res.json({
        success: true,
        data: validAthletes
      });
    } catch (error) {
      logger.error(`Error fetching athlete performance: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch athlete performance',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/coaches-tools/generate-training-groups/:teamId/:season
 * @desc    Generate rule-based training groups based on recent performance
 * @access  Private (Coach only)
 */
router.post(
  '/generate-training-groups/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      
      logger.info(`Generating training groups for team ${teamId}, season ${season}`);
      
      // Get team's current_season setting
      const { data: team } = await supabase
        .from('teams')
        .select('current_season')
        .eq('id', teamId)
        .single();
      
      // Use team's current_season if set, otherwise use requested season
      let targetSeason = team?.current_season || season;
      logger.info(`Using season ${targetSeason} (team setting: ${team?.current_season}, requested: ${season})`);
      
      // Get all races for this season
      const { data: seasonRaces, error: racesError } = await supabase
        .from('races')
        .select('id, date, season')
        .eq('team_id', teamId)
        .eq('season', targetSeason);
      
      if (racesError) {
        logger.error('Error fetching races:', racesError);
        throw racesError;
      }
      
      const raceIds = seasonRaces?.map(r => r.id) || [];
      logger.info(`Found ${raceIds.length} races for season ${season}`);
      
      if (raceIds.length === 0) {
        return res.json({
          success: true,
          data: { groups: [], rationale: `No races found for the ${season} season.` }
        });
      }
      
      // Get only athletes who have results in these races
      const { data: athleteIds, error: athleteIdsError } = await supabase
        .from('results')
        .select('athlete_id')
        .in('race_id', raceIds)
        .eq('team_id', teamId);
      
      if (athleteIdsError) throw athleteIdsError;
      
      const uniqueAthleteIds = [...new Set(athleteIds?.map(r => r.athlete_id) || [])];
      logger.info(`Found ${uniqueAthleteIds.length} athletes with results in season ${season}`);
      
      // Get athlete details for those who raced this season
      const { data: athletes, error: athletesError } = await supabase
        .from('athletes')
        .select('id, name, grade, gender')
        .in('id', uniqueAthleteIds);
      
      if (athletesError) throw athletesError;
      
      logger.info(`Fetched details for ${athletes?.length || 0} athletes`);
      
      // Get last 3 races for each athlete
      const athleteData = await Promise.all(
        athletes.map(async (athlete) => {
          const { data: results, error: resultsError } = await supabase
            .from('results')
            .select(`
              time,
              race_id,
              races!inner (date)
            `)
            .eq('athlete_id', athlete.id)
            .eq('team_id', teamId)
            .in('race_id', raceIds)
            .gt('time', 0);
          
          // Sort by date in JavaScript since Supabase can't order by joined fields
          const sortedResults = results?.sort((a, b) => 
            new Date(b.races.date).getTime() - new Date(a.races.date).getTime()
          ).slice(0, 3);
          
          if (resultsError) {
            logger.error(`Error fetching results for athlete ${athlete.name}:`, resultsError);
          }
          
          if (!sortedResults || sortedResults.length === 0) return null;
          
          const times = sortedResults.map(r => r.time);
          const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
          
          // Calculate per-mile pace correctly (avgTime is in seconds for 5K = 3.10686 miles)
          const avgPacePerMile = avgTime / 3.10686; // seconds per mile
          
          // Calculate consistency (standard deviation)
          const mean = avgTime;
          const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
          const stdDev = Math.sqrt(variance);
          const consistency = (stdDev / mean) * 100; // Lower is more consistent
          
          // Calculate trend
          const trend = times.length >= 2 
            ? ((times[times.length - 1] - times[0]) / times[times.length - 1]) * 100
            : 0;
          
          return {
            id: athlete.id,
            name: athlete.name,
            gender: athlete.gender,
            grade: parseInt(athlete.grade) || 12,
            avgTime,
            avgPacePerMile, // seconds per mile
            consistency,
            trend,
            raceCount: times.length
          };
        })
      );
      
      // Filter out athletes with no data
      const validAthletes = athleteData.filter(a => a !== null);
      
      logger.info(`Found ${validAthletes.length} athletes with race data for season ${season}`);
      
      if (validAthletes.length === 0) {
        logger.warn(`No athletes with race data found for season ${season}`);
        return res.json({
          success: true,
          data: { groups: [], rationale: `No athlete data available for the ${season} season.` }
        });
      }
      
      // Rule-based grouping algorithm
      const groups = [];
      
      // Separate by gender
      const boys = validAthletes.filter(a => ['M', 'Male', 'Boys', 'Men'].includes(a.gender));
      const girls = validAthletes.filter(a => ['F', 'Female', 'Girls', 'Women'].includes(a.gender));
      
      // Function to create groups for a gender using pace ranges
      const createGroups = (athletes, genderLabel) => {
        if (athletes.length === 0) return [];
        
        // Sort by average pace (fastest to slowest)
        const sorted = athletes.sort((a, b) => a.avgPacePerMile - b.avgPacePerMile);
        
        // Define pace ranges (15-second intervals for tighter grouping)
        const paceRanges = [];
        const minPace = Math.floor(sorted[0].avgPacePerMile / 15) * 15; // Round down to nearest 15 sec
        const maxPace = Math.ceil(sorted[sorted.length - 1].avgPacePerMile / 15) * 15;
        
        // Create 15-second pace buckets
        for (let pace = minPace; pace <= maxPace; pace += 15) {
          paceRanges.push({
            min: pace,
            max: pace + 15,
            athletes: []
          });
        }
        
        // Assign athletes to pace ranges
        sorted.forEach(athlete => {
          const range = paceRanges.find(r => athlete.avgPacePerMile >= r.min && athlete.avgPacePerMile < r.max);
          if (range) range.athletes.push(athlete);
        });
        
        // Filter out empty ranges and merge small groups
        let filledRanges = paceRanges.filter(r => r.athletes.length > 0);
        
        // Merge ranges with only 1 athlete into adjacent ranges
        const mergedRanges = [];
        for (let i = 0; i < filledRanges.length; i++) {
          const current = filledRanges[i];
          
          if (current.athletes.length === 1) {
            // Try to merge with previous or next range
            if (mergedRanges.length > 0) {
              // Merge with previous
              mergedRanges[mergedRanges.length - 1].athletes.push(...current.athletes);
              mergedRanges[mergedRanges.length - 1].max = current.max;
            } else if (i + 1 < filledRanges.length) {
              // Merge with next
              filledRanges[i + 1].athletes.unshift(...current.athletes);
              filledRanges[i + 1].min = current.min;
            } else {
              // Last athlete, keep as is
              mergedRanges.push(current);
            }
          } else {
            mergedRanges.push(current);
          }
        }
        
        // Create groups from merged ranges
        const genderGroups = mergedRanges.map((range, idx) => {
          const groupAthletes = range.athletes;
          
          // Calculate average pace for the group
          const avgPaceSeconds = groupAthletes.reduce((sum, a) => sum + a.avgPacePerMile, 0) / groupAthletes.length;
          const paceMin = Math.floor(avgPaceSeconds / 60);
          const paceSec = Math.floor(avgPaceSeconds % 60);
          
          // Determine group tier based on pace
          let tier = '';
          if (idx === 0) tier = 'Elite';
          else if (idx === 1) tier = 'Varsity';
          else if (idx === 2) tier = 'Development';
          else tier = 'Training';
          
          // Determine focus based on group characteristics
          const avgConsistency = groupAthletes.reduce((sum, a) => sum + a.consistency, 0) / groupAthletes.length;
          const avgTrend = groupAthletes.reduce((sum, a) => sum + a.trend, 0) / groupAthletes.length;
          
          let focus = '';
          if (avgConsistency > 5) {
            focus = 'Focus on consistency and pacing strategy';
          } else if (avgTrend < -3) {
            focus = 'Building on strong improvement trend';
          } else if (avgTrend > 3) {
            focus = 'Recovery and rebuilding confidence';
          } else {
            focus = 'Maintaining performance and pushing limits';
          }
          
          return {
            name: `${genderLabel} ${tier} (${paceMin}:${paceSec.toString().padStart(2, '0')}/mi)`,
            athletes: groupAthletes.map(a => a.name),
            focus,
            stats: {
              avgPace: `${paceMin}:${paceSec.toString().padStart(2, '0')}`,
              size: groupAthletes.length,
              gradeRange: `${Math.min(...groupAthletes.map(a => a.grade))}-${Math.max(...groupAthletes.map(a => a.grade))}`
            }
          };
        });
        
        return genderGroups;
      };
      
      // Create groups for both genders
      groups.push(...createGroups(boys, 'Boys'));
      groups.push(...createGroups(girls, 'Girls'));
      
      const rationale = `Groups created using pace-based ranges (15-second intervals). Athletes are grouped by average pace from their last ${validAthletes[0]?.raceCount || 3} races, separated by gender. Tighter pace ranges ensure athletes train with similar-ability teammates.`;
      
      res.json({
        success: true,
        data: {
          groups,
          rationale,
          method: 'rule-based'
        }
      });
    } catch (error) {
      logger.error(`Error generating training groups: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to generate training groups',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/coaches-tools/ai-insights/:teamId/:season
 * @desc    Use AI to identify patterns and insights in athlete performance
 * @access  Private (Coach only)
 */
router.post(
  '/ai-insights/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      const cacheKey = `ai-insights-${teamId}-${season}`;
      
      // Check cache first (24 hour TTL)
      const cached = trainingGroupsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.info('Returning cached AI insights');
        return res.json({
          success: true,
          data: cached.data,
          cached: true
        });
      }
      
      logger.info(`Generating AI insights for team ${teamId}, season ${season}`);
      
      // Get team's current_season
      const { data: team } = await supabase
        .from('teams')
        .select('current_season')
        .eq('id', teamId)
        .single();
      
      let targetSeason = team?.current_season || season;
      
      // Get races for this season
      const { data: seasonRaces } = await supabase
        .from('races')
        .select('id, date, season')
        .eq('team_id', teamId)
        .eq('season', targetSeason);
      
      const raceIds = seasonRaces?.map(r => r.id) || [];
      
      if (raceIds.length === 0) {
        return res.json({
          success: true,
          data: { insights: [], summary: 'No race data available for analysis.' }
        });
      }
      
      // Get athlete IDs with results
      const { data: athleteIds } = await supabase
        .from('results')
        .select('athlete_id')
        .in('race_id', raceIds)
        .eq('team_id', teamId);
      
      const uniqueAthleteIds = [...new Set(athleteIds?.map(r => r.athlete_id) || [])];
      
      // Get athlete details
      const { data: athletes } = await supabase
        .from('athletes')
        .select('id, name, grade, gender')
        .in('id', uniqueAthleteIds);
      
      // Get performance data for each athlete
      const athleteData = await Promise.all(
        athletes.map(async (athlete) => {
          const { data: results } = await supabase
            .from('results')
            .select(`
              time,
              place,
              race_id,
              races!inner (date, name)
            `)
            .eq('athlete_id', athlete.id)
            .eq('team_id', teamId)
            .in('race_id', raceIds)
            .gt('time', 0);
          
          const sortedResults = results?.sort((a, b) => 
            new Date(a.races.date).getTime() - new Date(b.races.date).getTime()
          );
          
          if (!sortedResults || sortedResults.length < 2) return null;
          
          const times = sortedResults.map(r => r.time);
          const places = sortedResults.map(r => r.place);
          const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
          const improvement = ((times[0] - times[times.length - 1]) / times[0]) * 100;
          
          // Calculate variance
          const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length;
          const consistency = Math.sqrt(variance);
          
          return {
            name: athlete.name,
            gender: athlete.gender,
            grade: athlete.grade,
            raceCount: times.length,
            avgTime: Math.round(avgTime),
            improvement: Math.round(improvement * 10) / 10,
            consistency: Math.round(consistency),
            avgPlace: Math.round(places.reduce((sum, p) => sum + p, 0) / places.length),
            bestTime: Math.min(...times),
            worstTime: Math.max(...times)
          };
        })
      );
      
      const validAthletes = athleteData.filter(a => a !== null);
      
      if (validAthletes.length === 0) {
        return res.json({
          success: true,
          data: { insights: [], summary: 'Insufficient data for AI analysis.' }
        });
      }
      
      // Prepare concise AI prompt for pattern analysis
      const prompt = `Analyze this cross country team's performance data and identify 3-5 key insights or patterns that a coach might not immediately notice. Focus on:
- Unusual improvement or decline patterns
- Athletes with breakthrough potential
- Consistency issues that need attention
- Correlation between factors
- Strategic recommendations

Team Data Summary:
${validAthletes.slice(0, 20).map(a => `${a.name}: ${a.raceCount} races, ${a.improvement > 0 ? '+' : ''}${a.improvement}% improvement, consistency: ${a.consistency}s variance`).join('\n')}

Return JSON only:
{
  "insights": [
    {
      "title": "Brief insight title",
      "description": "1-2 sentence explanation",
      "athletes": ["Athlete names if relevant"],
      "priority": "high|medium|low"
    }
  ],
  "summary": "2-3 sentence overview of team's overall performance patterns"
}`;
      
      // Call Gemini AI
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }
      
      const aiResponse = JSON.parse(jsonMatch[0]);
      
      // Cache the result
      trainingGroupsCache.set(cacheKey, {
        data: aiResponse,
        timestamp: Date.now()
      });
      
      res.json({
        success: true,
        data: aiResponse,
        cached: false
      });
    } catch (error) {
      logger.error(`Error generating AI insights: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to generate AI insights',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/coaches-tools/improvement-tracking/:teamId/:season
 * @desc    Get athlete improvement metrics sorted by performance
 * @access  Private (Coach only)
 */
router.get(
  '/improvement-tracking/:teamId/:season',
  authenticate,
  authorizeTeamAccess,
  async (req, res) => {
    try {
      const { teamId, season } = req.params;
      
      logger.info(`Fetching improvement tracking for team ${teamId}, season ${season}`);
      
      // Get team's current_season setting
      const { data: team } = await supabase
        .from('teams')
        .select('current_season')
        .eq('id', teamId)
        .single();
      
      // Use team's current_season if set, otherwise use requested season
      let targetSeason = team?.current_season || season;
      logger.info(`Using season ${targetSeason} (team setting: ${team?.current_season}, requested: ${season})`);
      
      // Get all races for this season first
      const { data: seasonRaces, error: racesError } = await supabase
        .from('races')
        .select('id, name, date, season')
        .eq('team_id', teamId)
        .eq('season', targetSeason);
      
      if (racesError) throw racesError;
      
      const raceIds = seasonRaces?.map(r => r.id) || [];
      logger.info(`Found ${raceIds.length} races for improvement tracking in season ${season}`);
      
      if (raceIds.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Get all athletes
      const { data: athletes, error: athletesError } = await supabase
        .from('athletes')
        .select('id, name, grade, gender')
        .eq('team_id', teamId);
      
      if (athletesError) throw athletesError;
      
      // Calculate improvement for each athlete
      const improvements = await Promise.all(
        athletes.map(async (athlete) => {
          const { data: results } = await supabase
            .from('results')
            .select(`
              time,
              place,
              race_id,
              races!inner (name, date, distance)
            `)
            .eq('athlete_id', athlete.id)
            .eq('team_id', teamId)
            .in('race_id', raceIds)
            .gt('time', 0);
          
          // Sort by date in JavaScript
          const sortedResults = results?.sort((a, b) => 
            new Date(a.races.date).getTime() - new Date(b.races.date).getTime()
          );
          
          if (!sortedResults || sortedResults.length < 2) return null;
          
          // Group races by distance to find comparable races
          const racesByDistance = sortedResults.reduce((acc, race) => {
            const distance = race.races.distance || '5000'; // Default to 5K if not set
            if (!acc[distance]) acc[distance] = [];
            acc[distance].push(race);
            return acc;
          }, {});
          
          // Find the distance with the most races (most common race distance)
          const primaryDistance = Object.entries(racesByDistance)
            .sort((a, b) => b[1].length - a[1].length)[0]?.[0];
          
          if (!primaryDistance) return null;
          
          const comparableRaces = racesByDistance[primaryDistance];
          if (comparableRaces.length < 2) return null;
          
          const firstRace = comparableRaces[0];
          const mostRecentRace = comparableRaces[comparableRaces.length - 1];
          const previous = comparableRaces.length > 1 ? comparableRaces[comparableRaces.length - 2] : null;
          
          // Find best (fastest) race of the season at this distance
          const bestRace = comparableRaces.reduce((best, current) => 
            current.time < best.time ? current : best
          );
          
          // Calculate improvements (positive = faster)
          const meetOverMeet = previous 
            ? ((previous.time - mostRecentRace.time) / previous.time) * 100
            : null;
          
          // Season improvement: first race vs best race (PR)
          const seasonImprovement = ((firstRace.time - bestRace.time) / firstRace.time) * 100;
          
          return {
            athlete: {
              id: athlete.id,
              name: athlete.name,
              grade: athlete.grade,
              gender: athlete.gender
            },
            firstRace: {
              name: firstRace.races.name,
              date: firstRace.races.date,
              time: firstRace.time,
              place: firstRace.place,
              distance: firstRace.races.distance
            },
            bestRace: {
              name: bestRace.races.name,
              date: bestRace.races.date,
              time: bestRace.time,
              place: bestRace.place,
              distance: bestRace.races.distance
            },
            mostRecentRace: {
              name: mostRecentRace.races.name,
              date: mostRecentRace.races.date,
              time: mostRecentRace.time,
              place: mostRecentRace.place,
              distance: mostRecentRace.races.distance
            },
            metrics: {
              meetOverMeetImprovement: meetOverMeet,
              seasonImprovement: seasonImprovement,
              totalRaces: comparableRaces.length,
              comparisonDistance: primaryDistance
            }
          };
        })
      );
      
      // Filter and sort by season improvement (descending)
      const validImprovements = improvements
        .filter(i => i !== null)
        .sort((a, b) => b.metrics.seasonImprovement - a.metrics.seasonImprovement);
      
      res.json({
        success: true,
        data: validImprovements
      });
    } catch (error) {
      logger.error(`Error fetching improvement tracking: ${error.message}`, { error });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch improvement tracking',
        error: error.message
      });
    }
  }
);

module.exports = router;
