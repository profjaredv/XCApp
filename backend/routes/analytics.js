const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

const normalizeGender = (value) => {
  if (!value) return 'M';
  const lower = value.toString().toLowerCase();
  if (['m', 'male', 'men', 'boy', 'boys'].includes(lower)) return 'M';
  if (['f', 'female', 'women', 'girl', 'girls'].includes(lower)) return 'F';
  return 'M';
};

router.get('/overview', authenticate, async (req, res) => {
  const { seasons } = req.query;
  const teamId = req.user.team?.id;

  if (!teamId || !seasons) {
    return res.status(400).json({ msg: 'Team context and seasons are required.' });
  }

  try {
    const seasonsArray = seasons.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
    
    if (seasonsArray.length === 0) {
      return res.status(400).json({ msg: 'Invalid seasons format.' });
    }

    // Use the first season for now (single season view)
    const season = seasonsArray[0];

    console.log(`Fetching analytics for team ${teamId}, season ${season} (type: ${typeof season})`);

    // Fetch team metrics - try both string and number
    const { data: teamMetrics, error: teamError } = await supabase
      .from('team_season_metrics')
      .select('*')
      .eq('team_id', teamId)
      .eq('season', season.toString())
      .maybeSingle();
    
    console.log('Team metrics found:', !!teamMetrics);

    if (teamError) {
      console.error('Error fetching team metrics:', teamError);
    }

    // Fetch athlete metrics
    const { data: athleteMetrics, error: athleteError } = await supabase
      .from('athlete_season_metrics')
      .select(`
        *,
        athlete:athletes(id, name, gender, grade)
      `)
      .eq('team_id', teamId)
      .eq('season', season.toString())
      .order('best_time_5k', { ascending: true, nullsLast: true });

    console.log('Athlete metrics found:', athleteMetrics?.length || 0);
    if (athleteError) {
      console.error('Error fetching athlete metrics:', athleteError);
    }

    // Fetch meet metrics
    const { data: meetMetrics, error: meetError } = await supabase
      .from('meet_performance_metrics')
      .select('*')
      .eq('team_id', teamId)
      .eq('season', season.toString())
      .order('meet_date', { ascending: true });

    console.log('Meet metrics found:', meetMetrics?.length || 0);
    if (meetError) {
      console.error('Error fetching meet metrics:', meetError);
    }

    console.log(`✅ Analytics overview complete: ${athleteMetrics?.length || 0} athletes, ${meetMetrics?.length || 0} meets`);

    // Transform athlete metrics to match frontend expectations
    const athletes = (athleteMetrics || []).map(am => {
      const athlete = am.athlete || {};
      const improvementPercent = am.improvement || 0;
      const gender = normalizeGender(am.gender || athlete.gender);

      return {
        id: athlete.id || am.athlete_id,
        name: athlete.name || 'Unknown',
        gender,
        currentGrade: athlete.grade || am.grade || 9,
        totalRaces: am.total_races || 0,
        bestTime: am.best_time_5k || 0,
        avgPace: am.average_pace || 0,
        improvementPercent: parseFloat(improvementPercent.toFixed(2)),
        raceCount: am.total_races || 0,
        races: []
      };
    });

    // Transform meet metrics to match frontend expectations
    const meets = (meetMetrics || []).map(mm => ({
      id: mm.race_id,
      name: mm.meet_name,
      date: mm.meet_date,
      location: '',
      distance: mm.distance || 5000,
      avgPace: mm.average_pace || 0,
      runners: mm.participant_count || 0,
      conditions: ''
    }));

    // Calculate most improved athletes (top 5)
    const mostImproved = athletes
      .filter(a => a.improvementPercent > 0)
      .sort((a, b) => b.improvementPercent - a.improvementPercent)
      .slice(0, 5)
      .map(a => ({
        id: a.id,
        name: a.name,
        improvementPercent: a.improvementPercent,
        currentGrade: a.currentGrade,
        gender: a.gender,
        teamName: req.user.team?.name || '',
        bestTime: a.bestTime,
        bestTimeDate: ''
      }));

    // Build team overview from team metrics
    const totalMeets = meets.length;  // Number of meets/events (e.g., 7)
    const totalRaces = teamMetrics?.total_races || 0;  // Total race results across all athletes (e.g., 630)
    const totalAthletes = athletes.length;
    const totalMilesRun = teamMetrics?.total_miles || 0;
    const avgMilePace = teamMetrics?.average_pace || 0;
    const avgAthletesPerRace = totalMeets > 0 ? totalRaces / totalMeets : 0;  // Avg results per meet

    const teamOverview = {
      totalMeets,
      totalRaces,
      totalAthletes,
      avgAthletesPerRace: parseFloat(avgAthletesPerRace.toFixed(1)),
      totalMilesRun: parseFloat(totalMilesRun.toFixed(2)),
      avgMilePace: parseFloat(avgMilePace.toFixed(2)),
      totalPRs: 0,
      top10Finishes: 0
    };

    // Split by gender
    const maleAthletes = athletes.filter(a => a.gender === 'M');
    const femaleAthletes = athletes.filter(a => a.gender === 'F');

    const menOverview = {
      totalAthletes: maleAthletes.length,
      avgMilePace: maleAthletes.length > 0 
        ? parseFloat((maleAthletes.reduce((sum, a) => sum + a.avgPace, 0) / maleAthletes.length).toFixed(2))
        : 0
    };

    const womenOverview = {
      totalAthletes: femaleAthletes.length,
      avgMilePace: femaleAthletes.length > 0 
        ? parseFloat((femaleAthletes.reduce((sum, a) => sum + a.avgPace, 0) / femaleAthletes.length).toFixed(2))
        : 0
    };

    res.json({
      athletes,
      team: {
        overview: teamOverview,
        men: menOverview,
        women: womenOverview
      },
      mostImproved,
      meets
    });

  } catch (err) {
    console.error('Error in analytics overview:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

router.get('/races/:raceId', authenticate, async (req, res) => {
  const { raceId } = req.params;

  try {
    console.log(`📊 Fetching race details for raceId: ${raceId}`);
    
    const { data: race, error: raceError } = await supabase
      .from('races')
      .select('*')
      .eq('id', raceId)
      .single();

    if (raceError || !race) {
      console.log(`❌ Race not found: ${raceId}`, raceError);
      return res.status(404).json({ msg: 'Race not found' });
    }

    console.log(`✅ Race found: ${race.name}`);

    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select(`
        *,
        athlete:athletes(*)
      `)
      .eq('race_id', raceId)
      .order('time', { ascending: true });

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      return res.status(500).json({ msg: 'Error fetching results' });
    }

    console.log(`✅ Found ${results?.length || 0} results for race ${race.name}`);

    res.json({
      race,
      results: results || []
    });

  } catch (err) {
    console.error('Error fetching race analytics:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/athletes/:athleteId', authenticate, async (req, res) => {
  const { athleteId } = req.params;
  const { season } = req.query;

  try {
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    if (athleteError || !athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    let query = supabase
      .from('results')
      .select(`
        *,
        race:races(*)
      `)
      .eq('athlete_id', athleteId)
      .order('race.date', { ascending: true });

    if (season) {
      query = query.eq('race.season', season);
    }

    const { data: results, error: resultsError } = await query;

    if (resultsError) {
      console.error('Error fetching athlete results:', resultsError);
      return res.status(500).json({ msg: 'Error fetching results' });
    }

    const stats = {
      totalRaces: results?.length || 0,
      bestTime: results?.length > 0 ? Math.min(...results.map(r => r.time)) : 0,
      avgTime: results?.length > 0 ? results.reduce((sum, r) => sum + r.time, 0) / results.length : 0
    };

    res.json({
      athlete,
      results: results || [],
      stats
    });

  } catch (err) {
    console.error('Error fetching athlete analytics:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
