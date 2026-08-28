const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { ANY_COACH, FULL_COACH } = require('../lib/teamRoles');

// A team's saved practice spots ("EHS Track", "Carey Lakes") — reusable
// choices for the Schedule day-editor's Location field, instead of
// retyping the same handful of place names every day. Team-wide, not
// season-scoped (a track doesn't stop existing between seasons).

// GET /api/practice-locations
router.get('/', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const locations = await prisma.practiceLocation.findMany({
      where: { teamId: req.user.teamId },
      orderBy: { name: 'asc' },
    });
    res.json(locations);
  } catch (error) {
    console.error('Error fetching practice locations:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-locations
router.post('/', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ msg: 'name is required.' });
  }

  try {
    const location = await prisma.practiceLocation.create({
      data: { teamId: req.user.teamId, name: name.trim() },
    });
    res.status(201).json(location);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'A location with that name already exists.' });
    }
    console.error('Error creating practice location:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/practice-locations/:id — rename and/or archive/restore.
router.put('/:id', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { name, archived } = req.body;
  try {
    const location = await prisma.practiceLocation.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!location) {
      return res.status(404).json({ msg: 'Location not found.' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (archived !== undefined) updates.archived = Boolean(archived);

    const updated = await prisma.practiceLocation.update({ where: { id: location.id }, data: updates });
    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'A location with that name already exists.' });
    }
    console.error('Error updating practice location:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
