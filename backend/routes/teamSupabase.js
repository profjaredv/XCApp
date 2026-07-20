const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// @route   GET /api/team/performance
// @desc    Get team performance data for a specific season
// @access  Private
router.get('/performance', authenticate, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.team_id || req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const seasonYear = season ? parseInt(season) : new Date().getFullYear();
    const seasonStr = String(seasonYear);
    
    console.log(`Fetching performance data for team ${teamId} and season ${seasonStr}`);
    
    // Get team info
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    // Get all races for the team in this season
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('*')
      .eq('team_id', teamId)
      .eq('season', seasonStr)
      .order('date', { ascending: true });

    if (racesError) {
      console.error('Error fetching races:', racesError);
      return res.status(500).json({ msg: 'Error fetching races' });
    }

    // Get all results for these races
    const raceIds = races.map(r => r.id);
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select('*')
      .in('race_id', raceIds)
      .gt('time', 0);

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      return res.status(500).json({ msg: 'Error fetching results' });
    }

    // Helper to parse distance to miles
    const parseDistanceToMiles = (distStr, distMeters) => {
      if (distMeters && distMeters > 0) return distMeters / 1609.34;
      if (!distStr) return 0;
      const label = distStr.toLowerCase();
      const kMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*k/);
      if (kMatch) return (parseFloat(kMatch[1]) * 1000) / 1609.34;
      const miMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*(mi|mile|miles)/);
      if (miMatch) return parseFloat(miMatch[1]);
      if (label.includes('5k')) return 3.10686;
      return 0;
    };

    // Calculate stats
    const meetCount = races.length;
    const totalRaces = results.length;
    
    // Calculate total miles and average pace
    let totalMiles = 0;
    let totalTime = 0;
    const athleteSet = new Set();

    results.forEach(result => {
      const race = races.find(r => r.id === result.race_id);
      if (race) {
        const distMiles = parseDistanceToMiles(race.distance, race.distance_meters);
        totalMiles += distMiles;
        totalTime += result.time;
        athleteSet.add(result.athlete_id);
      }
    });

    const avgPace = totalMiles > 0 ? (totalTime / totalMiles) : 0;
    const totalRunners = athleteSet.size;

    // Calculate improvement (first meet vs last meet)
    let improvementPercent = 0;
    if (races.length >= 2) {
      const firstRace = races[0];
      const lastRace = races[races.length - 1];

      const firstRaceResults = results.filter(r => r.race_id === firstRace.id && r.time > 0);
      const lastRaceResults = results.filter(r => r.race_id === lastRace.id && r.time > 0);

      if (firstRaceResults.length > 0 && lastRaceResults.length > 0) {
        const firstDist = parseDistanceToMiles(firstRace.distance, firstRace.distance_meters);
        const lastDist = parseDistanceToMiles(lastRace.distance, lastRace.distance_meters);

        if (firstDist > 0 && lastDist > 0) {
          const firstAvgPace = firstRaceResults.reduce((sum, r) => sum + r.time, 0) / (firstRaceResults.length * firstDist);
          const lastAvgPace = lastRaceResults.reduce((sum, r) => sum + r.time, 0) / (lastRaceResults.length * lastDist);

          if (firstAvgPace > 0 && lastAvgPace > 0) {
            improvementPercent = ((firstAvgPace - lastAvgPace) / firstAvgPace) * 100;
          }
        }
      }
    }

    // Format first and last meet data
    const firstMeet = races.length > 0 ? {
      name: races[0].name,
      date: races[0].date,
      avgPace: 0 // Can calculate if needed
    } : null;

    const lastMeet = races.length > 0 ? {
      name: races[races.length - 1].name,
      date: races[races.length - 1].date,
      avgPace: 0 // Can calculate if needed
    } : null;

    res.json({
      id: teamId,
      name: team.name,
      totalRaces,
      totalMiles: parseFloat(totalMiles.toFixed(2)),
      avgMilePace: avgPace,
      meetCount,
      totalRunners,
      improvementPercent: parseFloat(improvementPercent.toFixed(1)),
      firstMeet,
      lastMeet
    });
  } catch (err) {
    console.error('Error in /team/performance:', err);
    res.status(500).json({ msg: 'Server Error', error: err.message });
  }
});

// @route   GET /api/team/pending-claims
// @desc    Get pending profile claims for coach review
// @access  Private
router.get('/pending-claims', authenticate, async (req, res) => {
  try {
    const teamId = req.user.team_id || req.user.team?.id;
    const userRole = req.user.role;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context is required.' });
    }

    if (userRole !== 'coach') {
      return res.status(403).json({ msg: 'Only coaches can view pending claims.' });
    }

    // For now, return empty array since pending claims feature needs to be implemented in Supabase
    // TODO: Implement pending_claims table in Supabase
    res.json({ pendingClaims: [] });
  } catch (error) {
    console.error('Error fetching pending claims:', error);
    res.status(500).json({ msg: 'Failed to fetch pending claims.' });
  }
});

module.exports = router;
