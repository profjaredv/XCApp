const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { sport = 'XC' } = req.query;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: seasons, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('team_id', teamId)
      .eq('sport', sport)
      .order('year', { ascending: false });

    if (error) {
      console.error('Error fetching seasons:', error);
      return res.status(500).json({ msg: 'Error fetching seasons' });
    }

    res.json(seasons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/current', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { sport = 'XC' } = req.query;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: currentSeason, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('team_id', teamId)
      .eq('sport', sport)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching current season:', error);
      return res.status(500).json({ msg: 'Error fetching current season' });
    }

    if (!currentSeason) {
      return res.status(404).json({ msg: 'No active season found.' });
    }

    res.json(currentSeason);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { year, sport = 'XC', startDate, endDate } = req.body;

  if (!teamId || !year) {
    return res.status(400).json({ msg: 'Team context and year are required.' });
  }

  try {
    const { data: existing, error: checkError } = await supabase
      .from('seasons')
      .select('*')
      .eq('team_id', teamId)
      .eq('year', year)
      .eq('sport', sport)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ msg: 'Season already exists.' });
    }

    const { data: season, error } = await supabase
      .from('seasons')
      .insert({
        year,
        sport,
        team_id: teamId,
        start_date: startDate,
        end_date: endDate,
        is_active: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating season:', error);
      return res.status(500).json({ msg: 'Error creating season' });
    }

    res.json(season);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { isActive, startDate, endDate } = req.body;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.id)
      .eq('team_id', teamId)
      .maybeSingle();

    if (fetchError || !season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    if (isActive) {
      await supabase
        .from('seasons')
        .update({ is_active: false })
        .eq('team_id', teamId)
        .eq('sport', season.sport)
        .neq('id', season.id);
    }

    const updates = {};
    if (isActive !== undefined) updates.is_active = isActive;
    if (startDate) updates.start_date = startDate;
    if (endDate) updates.end_date = endDate;

    const { data: updated, error: updateError } = await supabase
      .from('seasons')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating season:', updateError);
      return res.status(500).json({ msg: 'Error updating season' });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post('/:id/roster', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { athletes } = req.body;

  if (!teamId || !athletes || !Array.isArray(athletes)) {
    return res.status(400).json({ msg: 'Team context and athletes array are required.' });
  }

  try {
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.id)
      .eq('team_id', teamId)
      .maybeSingle();

    if (fetchError || !season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const rosterEntries = athletes
      .filter(a => a.id && a.grade)
      .map(a => ({
        season_id: season.id,
        athlete_id: a.id,
        grade: a.grade,
        is_active: true
      }));

    if (rosterEntries.length > 0) {
      await supabase.from('season_roster').insert(rosterEntries);
    }

    const { data: updatedRoster, error: rosterError } = await supabase
      .from('season_roster')
      .select(`
        *,
        athlete:athletes(*)
      `)
      .eq('season_id', season.id);

    res.json({ ...season, roster: updatedRoster || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:id/roster/:athleteId', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.id)
      .eq('team_id', teamId)
      .maybeSingle();

    if (fetchError || !season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    await supabase
      .from('season_roster')
      .delete()
      .eq('season_id', req.params.id)
      .eq('athlete_id', req.params.athleteId);

    res.json({ msg: 'Athlete removed from roster' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:id/roster', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;
  const { activeOnly = 'true' } = req.query;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.id)
      .eq('team_id', teamId)
      .maybeSingle();

    if (fetchError || !season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    let query = supabase
      .from('season_roster')
      .select(`
        *,
        athlete:athletes(*)
      `)
      .eq('season_id', req.params.id);

    if (activeOnly === 'true' || activeOnly === true) {
      query = query.eq('is_active', true);
    }

    const { data: roster, error } = await query;

    if (error) {
      console.error('Error fetching roster:', error);
      return res.status(500).json({ msg: 'Error fetching roster' });
    }

    res.json(roster || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.delete('/:id/results', authenticate, async (req, res) => {
  const teamId = req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    const { data: season, error: fetchError } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', req.params.id)
      .eq('team_id', teamId)
      .maybeSingle();

    if (fetchError || !season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const { data: races } = await supabase
      .from('races')
      .select('id')
      .eq('team_id', teamId)
      .eq('season', season.year.toString());

    if (races && races.length > 0) {
      const raceIds = races.map(r => r.id);
      const { error: deleteError } = await supabase
        .from('results')
        .delete()
        .in('race_id', raceIds);

      if (deleteError) {
        console.error('Error deleting results:', deleteError);
        return res.status(500).json({ msg: 'Error deleting results' });
      }
    }

    res.json({
      success: true,
      message: `Cleared results for season ${season.year}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
