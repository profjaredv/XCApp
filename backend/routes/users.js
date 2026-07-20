const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/users/me
// Get current user's profile
router.get('/me', authenticate, async (req, res) => {
  try {
    return res.status(200).send(req.user);
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});

// PUT /api/users/me
// Update current user's profile fields (currently: name)
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).send({ message: 'Name is required.' });
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        name: name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select(`
        *,
        team:teams(*)
      `)
      .single();

    if (error) {
      console.error('Failed to update profile:', error);
      return res.status(500).send({ message: 'Failed to update profile.' });
    }

    if (!updated) {
      return res.status(404).send({ message: 'User not found.' });
    }

    return res.status(200).send({ message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error('Failed to update profile:', err);
    return res.status(500).send({ message: 'Internal Server Error' });
  }
});

module.exports = router;
