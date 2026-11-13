// An athlete's own Track & Field record. Separate from routes/track.js on
// purpose: everything there is the coach's view of the whole team, gated to
// coaches. This is one athlete reading their own marks and relays, and
// nothing about anyone else beyond the names on their own relay squads.
const express = require('express');
const router = express.Router();
const { authenticate, requireTeam, requireLinkedAthlete } = require('../middleware/auth');
const { requireFeature } = require('../middleware/teamFeatures');
const { loadTrackAthlete } = require('./track');

// GET /api/track-me — always the caller's own linked athlete; there is no id to pass.
router.get('/', authenticate, requireTeam, requireFeature('track'), requireLinkedAthlete, async (req, res) => {
  try {
    const a = req.user.linkedAthlete;
    if (a.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });
    res.json(await loadTrackAthlete(req.user.teamId, { id: a.id, name: a.name, gender: a.gender, graduationYear: a.graduationYear }));
  } catch (err) {
    console.error('Error fetching own track record:', err.message);
    res.status(500).json({ message: 'Could not load your track results.' });
  }
});

module.exports = router;
