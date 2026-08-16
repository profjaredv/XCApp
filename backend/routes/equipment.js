const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');

// T6 (Team Management handoff): equipment and uniform checkout. The doc
// never scopes this domain to VOLUNTEER_COACH (same reasoning as T4's
// meet operations), so every route here is head/paid-coach only.
const COACH_ROLES = ['HEAD_COACH', 'COACH'];

const VALID_TYPES = ['TOP', 'BOTTOM', 'SPIKES', 'OTHER'];
const VALID_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'];

// GET /api/equipment?type=
router.get('/', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { type } = req.query;
  try {
    const items = await prisma.equipment.findMany({
      where: { teamId: req.user.teamId, ...(type ? { type } : {}) },
      include: {
        assignments: {
          where: { returnedAt: null },
          include: { athlete: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ type: 'asc' }, { identifier: 'asc' }],
    });

    res.json(
      items.map((item) => ({
        id: item.id,
        type: item.type,
        identifier: item.identifier,
        size: item.size,
        condition: item.condition,
        retired: item.retired,
        notes: item.notes,
        checkedOutTo: item.assignments[0]
          ? { assignmentId: item.assignments[0].id, athleteId: item.assignments[0].athleteId, athleteName: item.assignments[0].athlete.name }
          : null,
      }))
    );
  } catch (error) {
    console.error('Error fetching equipment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/equipment — add inventory ahead of a checkout (e.g. sizing a
// new order). Checkout below can also create an item on the fly, so this
// isn't a required step, just an available one.
router.post('/', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { type, identifier, size, condition, notes } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ msg: 'A valid type is required.' });
  }
  if (!identifier || !String(identifier).trim()) {
    return res.status(400).json({ msg: 'identifier is required.' });
  }

  try {
    const item = await prisma.equipment.create({
      data: {
        teamId: req.user.teamId,
        type,
        identifier: String(identifier).trim(),
        size: size || null,
        condition: condition && VALID_CONDITIONS.includes(condition) ? condition : 'GOOD',
        notes: notes || null,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'An item with that type and identifier already exists.' });
    }
    console.error('Error creating equipment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/equipment/:id
router.put('/:id', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { size, condition, retired, notes } = req.body;
  try {
    const item = await prisma.equipment.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!item) {
      return res.status(404).json({ msg: 'Item not found.' });
    }

    const updates = {};
    if (size !== undefined) updates.size = size;
    if (condition !== undefined && VALID_CONDITIONS.includes(condition)) updates.condition = condition;
    if (retired !== undefined) updates.retired = Boolean(retired);
    if (notes !== undefined) updates.notes = notes;

    const updated = await prisma.equipment.update({ where: { id: item.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating equipment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/equipment/checkout — the type-and-enter flow: identifier +
// type + athlete, one call. Resolves (or creates, if this identifier has
// never been seen) the Equipment row by (teamId, type, identifier) so a
// coach doesn't need a separate "add inventory" step for every jersey
// number before checkout can start. size is optional and, when given,
// always applied to the item (create or update) — the grid checkout flow
// captures size and number together in one action, same as a coach
// writing both on a paper sign-out sheet.
router.post('/checkout', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { type, identifier, athleteId, seasonId, size, dueDate, conditionOut, notes } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ msg: 'A valid type is required.' });
  }
  if (!identifier || !String(identifier).trim()) {
    return res.status(400).json({ msg: 'identifier is required.' });
  }
  if (!athleteId || !seasonId) {
    return res.status(400).json({ msg: 'athleteId and seasonId are required.' });
  }

  try {
    const [athlete, season] = await Promise.all([
      prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } }),
      prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } }),
    ]);
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const trimmedSize = size ? String(size).trim() : null;
    const item = await prisma.equipment.upsert({
      where: { teamId_type_identifier: { teamId: req.user.teamId, type, identifier: String(identifier).trim() } },
      update: trimmedSize ? { size: trimmedSize } : {},
      create: { teamId: req.user.teamId, type, identifier: String(identifier).trim(), size: trimmedSize },
    });

    if (item.retired) {
      return res.status(409).json({ msg: `${item.identifier} is retired and can't be checked out.` });
    }

    const activeAssignment = await prisma.equipmentAssignment.findFirst({
      where: { equipmentId: item.id, returnedAt: null },
      include: { athlete: { select: { name: true } } },
    });
    if (activeAssignment) {
      return res.status(409).json({ msg: `${item.identifier} is already checked out to ${activeAssignment.athlete.name}.` });
    }

    const assignment = await prisma.equipmentAssignment.create({
      data: {
        equipmentId: item.id,
        athleteId,
        seasonId,
        checkedOutAt: new Date(),
        checkedOutById: req.user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        conditionOut: conditionOut && VALID_CONDITIONS.includes(conditionOut) ? conditionOut : item.condition,
        notes: notes || null,
      },
      include: { equipment: true, athlete: { select: { id: true, name: true } } },
    });

    res.status(201).json(assignment);
  } catch (error) {
    // The partial unique index (equipment_assignments_active_equipment_unique,
    // DB-only — see the migration) is the real guard against a race between
    // two coaches checking out the same item at once; the check above
    // handles the common case with a friendly message naming the holder.
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'That item was just checked out by someone else — refresh and try again.' });
    }
    console.error('Error checking out equipment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/equipment/assignments/:assignmentId/return
router.post('/assignments/:assignmentId/return', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { conditionIn, notes } = req.body;
  try {
    const assignment = await prisma.equipmentAssignment.findFirst({
      where: { id: req.params.assignmentId, equipment: { teamId: req.user.teamId } },
    });
    if (!assignment) {
      return res.status(404).json({ msg: 'Assignment not found.' });
    }
    if (assignment.returnedAt) {
      return res.status(409).json({ msg: 'This item was already returned.' });
    }

    const updated = await prisma.equipmentAssignment.update({
      where: { id: assignment.id },
      data: {
        returnedAt: new Date(),
        returnedById: req.user.id,
        conditionIn: conditionIn && VALID_CONDITIONS.includes(conditionIn) ? conditionIn : null,
        notes: notes !== undefined ? notes : assignment.notes,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error returning equipment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/equipment/outstanding?seasonId= — the season-end outstanding
// report: every unreturned item, grouped by athlete. The feature that
// justifies the whole build, per the doc.
router.get('/outstanding', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const outstanding = await prisma.equipmentAssignment.findMany({
      where: { seasonId, returnedAt: null },
      include: { equipment: true, athlete: { select: { id: true, name: true } } },
      orderBy: { checkedOutAt: 'asc' },
    });

    const byAthlete = new Map();
    for (const a of outstanding) {
      if (!byAthlete.has(a.athleteId)) {
        byAthlete.set(a.athleteId, { athleteId: a.athleteId, athleteName: a.athlete.name, items: [] });
      }
      byAthlete.get(a.athleteId).items.push({
        assignmentId: a.id,
        type: a.equipment.type,
        identifier: a.equipment.identifier,
        checkedOutAt: a.checkedOutAt,
        dueDate: a.dueDate,
      });
    }

    res.json([...byAthlete.values()].sort((a, b) => a.athleteName.localeCompare(b.athleteName)));
  } catch (error) {
    console.error('Error building outstanding report:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
