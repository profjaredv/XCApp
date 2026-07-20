const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const { season, activeOnly, search } = req.query;
  const teamId = req.user.team_id || req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const seasonYear = season ? parseInt(season) : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const isCurrentSeason = seasonYear === currentYear;
    const onlyActive = String(activeOnly ?? 'true').toLowerCase() !== 'false';

    let query = supabase
      .from('athletes')
      .select('*')
      .eq('team_id', teamId);

    if (search && search.trim() !== '') {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: athletes, error: athletesError } = await query.order('name', { ascending: true });

    if (athletesError) {
      console.error('Error fetching athletes:', athletesError);
      return res.status(500).json({ msg: 'Error fetching athletes' });
    }

    const athleteIds = athletes.map(a => a.id);

    console.log(`Fetching results for ${athleteIds.length} athletes, season ${seasonYear}`);

    // First get all races for this season
    const { data: seasonRaces, error: racesError } = await supabase
      .from('races')
      .select('id')
      .eq('team_id', teamId)
      .eq('season', seasonYear);

    if (racesError) {
      console.error('Error fetching races:', racesError);
      return res.status(500).json({ msg: 'Error fetching races' });
    }

    console.log(`Found ${seasonRaces?.length || 0} races for season ${seasonYear}`);

    const raceIds = (seasonRaces || []).map(r => r.id);

    // Then get results for those races
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select(`
        *,
        race:races(*)
      `)
      .in('athlete_id', athleteIds)
      .in('race_id', raceIds);

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
    }

    console.log(`Found ${results?.length || 0} results for athletes`);

    const resultMap = new Map();
    (results || []).forEach(result => {
      if (result.race) {
        const athleteId = result.athlete_id;
        if (!resultMap.has(athleteId)) {
          resultMap.set(athleteId, []);
        }
        resultMap.get(athleteId).push(result);
      }
    });

    const enriched = athletes.map(a => {
      const races = resultMap.get(a.id) || [];
      const raceCount = races.length;
      const graduated = typeof a.graduation_year === 'number' ? a.graduation_year <= seasonYear : false;

      return {
        ...a,
        races,
        raceCount,
        graduated
      };
    });

    let filtered = enriched;
    if (onlyActive) {
      if (isCurrentSeason) {
        filtered = enriched.filter(a => a.raceCount > 0 || !a.graduated);
      } else {
        filtered = enriched.filter(a => a.raceCount > 0);
      }
    }

    res.json(filtered);
  } catch (error) {
    console.error('Error in GET /athletes:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:athleteId', authenticate, async (req, res) => {
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

    if (athlete.team_id !== req.user.team?.id) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const seasonYear = season ? parseInt(season) : new Date().getFullYear();

    // Get all races for this season first
    const { data: seasonRaces, error: racesError } = await supabase
      .from('races')
      .select('id')
      .eq('season', seasonYear);

    if (racesError) {
      console.error('Error fetching races:', racesError);
      return res.status(500).json({ msg: 'Error fetching races' });
    }

    const raceIds = (seasonRaces || []).map(r => r.id);

    // Then get results for those races
    const { data: results, error: resultsError } = await supabase
      .from('results')
      .select(`
        *,
        race:races(*)
      `)
      .eq('athlete_id', athleteId)
      .in('race_id', raceIds);
    
    // Sort by race date (can't use .order() on joined table)
    const sortedResults = (results || []).sort((a, b) => {
      const dateA = new Date(a.race?.date || 0);
      const dateB = new Date(b.race?.date || 0);
      return dateA.getTime() - dateB.getTime();
    });

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
    }

    res.json({
      ...athlete,
      results: sortedResults
    });
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const { firstName, lastName, graduationYear, gender } = req.body;
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context required' });
  }

  if (!firstName || !lastName) {
    return res.status(400).json({ msg: 'First name and last name are required' });
  }

  try {
    const { data: athlete, error } = await supabase
      .from('athletes')
      .insert({
        team_id: teamId,
        name: `${firstName} ${lastName}`,
        graduation_year: graduationYear ? parseInt(graduationYear) : null,
        gender: gender || 'M'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating athlete:', error);
      return res.status(500).json({ msg: 'Error creating athlete' });
    }

    res.status(201).json(athlete);
  } catch (error) {
    console.error('Error in POST /athletes:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/:athleteId', authenticate, async (req, res) => {
  const { athleteId } = req.params;
  const { firstName, lastName, graduationYear, gender } = req.body;
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context required' });
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    if (existing.team_id !== teamId) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const updates = {};
    if (firstName && lastName) {
      updates.name = `${firstName} ${lastName}`;
    }
    if (graduationYear !== undefined) updates.graduation_year = graduationYear ? parseInt(graduationYear) : null;
    if (gender) updates.gender = gender;

    const { data: athlete, error: updateError } = await supabase
      .from('athletes')
      .update(updates)
      .eq('id', athleteId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating athlete:', updateError);
      return res.status(500).json({ msg: 'Error updating athlete' });
    }

    res.json(athlete);
  } catch (error) {
    console.error('Error in PUT /athletes/:athleteId:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:athleteId', authenticate, async (req, res) => {
  const { athleteId } = req.params;
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context required' });
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    if (existing.team_id !== teamId) {
      return res.status(403).json({ msg: 'Access denied' });
    }

    const { error: deleteError } = await supabase
      .from('athletes')
      .delete()
      .eq('id', athleteId);

    if (deleteError) {
      console.error('Error deleting athlete:', deleteError);
      return res.status(500).json({ msg: 'Error deleting athlete' });
    }

    res.json({ msg: 'Athlete deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /athletes/:athleteId:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
