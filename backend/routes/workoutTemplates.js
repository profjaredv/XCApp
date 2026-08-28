const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { ANY_COACH, FULL_COACH } = require('../lib/teamRoles');

// GET /api/workout-templates
router.get('/', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const templates = await prisma.workoutTemplate.findMany({
      where: { teamId: req.user.teamId, archived: false },
      orderBy: { name: 'asc' },
    });
    res.json(templates);
  } catch (error) {
    console.error('Error fetching workout templates:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/workout-templates
router.post('/', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { name, volumeTier, focus, durationMinutes, distanceMi, strength, details } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ msg: 'name is required.' });
  }

  try {
    const template = await prisma.workoutTemplate.create({
      data: {
        teamId: req.user.teamId,
        name: name.trim(),
        volumeTier: volumeTier || null,
        focus: focus || null,
        durationMinutes: durationMinutes ?? null,
        distanceMi: distanceMi ?? null,
        strength: Boolean(strength),
        details: details || null,
        createdById: req.user.id,
      },
    });
    res.status(201).json(template);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'A template with that name already exists.' });
    }
    console.error('Error creating workout template:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/workout-templates/:id
router.put('/:id', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { name, volumeTier, focus, durationMinutes, distanceMi, strength, details, archived } = req.body;

  try {
    const template = await prisma.workoutTemplate.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!template) {
      return res.status(404).json({ msg: 'Template not found.' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (volumeTier !== undefined) updates.volumeTier = volumeTier;
    if (focus !== undefined) updates.focus = focus;
    if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
    if (distanceMi !== undefined) updates.distanceMi = distanceMi;
    if (strength !== undefined) updates.strength = strength;
    if (details !== undefined) updates.details = details;
    if (archived !== undefined) updates.archived = Boolean(archived);

    const updated = await prisma.workoutTemplate.update({ where: { id: template.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating workout template:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
