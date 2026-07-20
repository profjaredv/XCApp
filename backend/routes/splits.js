const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/splits/race/:raceId
 * @desc    Get all splits for a race
 * @access  Private (Team Member)
 */
router.get('/race/:raceId', authenticate, async (req, res) => {
  try {
    const { raceId } = req.params;
    const teamId = req.user.team?.id;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context required' });
    }

    const { data: splits, error } = await supabase
      .from('race_splits')
      .select(`
        *,
        athlete:athletes(id, name, gender, grade),
        result:results(time, place)
      `)
      .eq('race_id', raceId)
      .eq('team_id', teamId)
      .order('result.place', { ascending: true });

    if (error) throw error;

    res.json(splits || []);
  } catch (err) {
    console.error('Error fetching race splits:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

/**
 * @route   GET /api/splits/athlete/:athleteId
 * @desc    Get all splits for an athlete
 * @access  Private (Team Member)
 */
router.get('/athlete/:athleteId', authenticate, async (req, res) => {
  try {
    const { athleteId } = req.params;
    const teamId = req.user.team?.id;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context required' });
    }

    const { data: splits, error } = await supabase
      .from('race_splits')
      .select(`
        *,
        race:races(id, name, date, distance),
        result:results(time, place)
      `)
      .eq('athlete_id', athleteId)
      .eq('team_id', teamId)
      .order('race.date', { ascending: false });

    if (error) throw error;

    res.json(splits || []);
  } catch (err) {
    console.error('Error fetching athlete splits:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

/**
 * @route   POST /api/splits/batch
 * @desc    Create or update multiple splits at once
 * @access  Private (Coach)
 */
router.post('/batch', authenticate, async (req, res) => {
  try {
    const { splits } = req.body;
    const teamId = req.user.team?.id;
    const userId = req.user.id;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context required' });
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ msg: 'Coach access required' });
    }

    if (!Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ msg: 'Splits array required' });
    }

    // Validate and prepare splits data
    const splitsToUpsert = splits.map(split => ({
      result_id: split.resultId,
      athlete_id: split.athleteId,
      race_id: split.raceId,
      team_id: teamId,
      mile_1: parseFloat(split.mile1),
      mile_2: parseFloat(split.mile2),
      mile_3: parseFloat(split.mile3),
      created_by: userId
    }));

    // Upsert splits (insert or update if exists)
    const { data, error } = await supabase
      .from('race_splits')
      .upsert(splitsToUpsert, {
        onConflict: 'result_id',
        returning: 'representation'
      });

    if (error) throw error;

    res.json({
      success: true,
      count: data?.length || 0,
      splits: data
    });
  } catch (err) {
    console.error('Error saving splits:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

/**
 * @route   PUT /api/splits/:splitId
 * @desc    Update a single split
 * @access  Private (Coach)
 */
router.put('/:splitId', authenticate, async (req, res) => {
  try {
    const { splitId } = req.params;
    const { mile1, mile2, mile3 } = req.body;
    const teamId = req.user.team?.id;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context required' });
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ msg: 'Coach access required' });
    }

    const { data, error } = await supabase
      .from('race_splits')
      .update({
        mile_1: parseFloat(mile1),
        mile_2: parseFloat(mile2),
        mile_3: parseFloat(mile3)
      })
      .eq('id', splitId)
      .eq('team_id', teamId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error updating split:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

/**
 * @route   DELETE /api/splits/:splitId
 * @desc    Delete a split
 * @access  Private (Coach)
 */
router.delete('/:splitId', authenticate, async (req, res) => {
  try {
    const { splitId } = req.params;
    const teamId = req.user.team?.id;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context required' });
    }

    if (req.user.role !== 'coach') {
      return res.status(403).json({ msg: 'Coach access required' });
    }

    const { error } = await supabase
      .from('race_splits')
      .delete()
      .eq('id', splitId)
      .eq('team_id', teamId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting split:', err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;
