const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const seasonYear = season ? parseInt(season) : new Date().getFullYear();

    const { data: races, error } = await supabase
      .from('races')
      .select(`
        *,
        results(*)
      `)
      .eq('team_id', teamId)
      .eq('season', seasonYear)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching meets:', error);
      return res.status(500).json({ msg: 'Error fetching meets' });
    }

    const meetData = races.map(race => {
      const results = race.results || [];
      const runnerCount = results.length;
      const avgPace = results.length > 0
        ? results.reduce((sum, r) => sum + (r.pace || 0), 0) / results.length
        : 0;

      return {
        ...race,
        runnerCount,
        avgPace,
        results: undefined
      };
    });

    res.json(meetData);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: meet, error: meetError } = await supabase
      .from('races')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (meetError || !meet) {
      return res.status(404).json({ msg: 'Meet not found' });
    }

    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select(`
        *,
        athlete:athletes(id, name, gender)
      `)
      .eq('race_id', meet.id)
      .order('time', { ascending: true });

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
    }

    const meetWithResults = {
      ...meet,
      results: (results || []).map(r => ({
        ...r,
        athleteId: r.athlete_id,
        grade: r.grade, // Use result.grade (season-specific) not athlete.grade
        athlete: r.athlete ? {
          ...r.athlete,
          grade: r.grade // Override athlete.grade with result.grade
        } : null
      }))
    };

    res.json(meetWithResults);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
