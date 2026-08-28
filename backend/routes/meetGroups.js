const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');
const logger = require('../utils/logger');

// GET /api/meet-groups
router.get('/', authenticate, requireTeam, async (req, res) => {
  try {
    const meetGroups = await prisma.meetGroup.findMany({
      where: { teamId: req.user.teamId },
      orderBy: { groupName: 'asc' },
      include: { races: { include: { race: { select: { id: true, name: true, season: true, date: true } } } } },
    });

    const transformedGroups = meetGroups.map((group) => ({
      id: group.id,
      groupName: group.groupName,
      description: group.description,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      races: group.races.map((mgr) => mgr.race).filter(Boolean),
      seasons: [...new Set(group.races.map((mgr) => mgr.race?.season).filter(Boolean))].sort(),
    }));

    res.json({ success: true, data: transformedGroups });
  } catch (error) {
    logger.error(`Error fetching meet groups: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch meet groups' });
  }
});

// POST /api/meet-groups
router.post('/', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { groupName, description, raceIds } = req.body;

  if (!groupName) {
    return res.status(400).json({ success: false, message: 'Group name is required' });
  }

  try {
    const newGroup = await prisma.meetGroup.create({
      data: { teamId: req.user.teamId, groupName, description: description || null },
    });

    if (raceIds && raceIds.length > 0) {
      // Only link races that actually belong to this team.
      const validRaces = await prisma.race.findMany({
        where: { id: { in: raceIds }, teamId: req.user.teamId },
        select: { id: true },
      });

      if (validRaces.length > 0) {
        await prisma.meetGroupRace.createMany({
          data: validRaces.map((r) => ({ meetGroupId: newGroup.id, raceId: r.id })),
          skipDuplicates: true,
        });
      }
    }

    res.status(201).json({
      success: true,
      data: { id: newGroup.id, groupName: newGroup.groupName, description: newGroup.description },
    });
  } catch (error) {
    logger.error(`Error creating meet group: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to create meet group' });
  }
});

// PUT /api/meet-groups/:groupId
router.put('/:groupId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { groupName, description } = req.body;

  try {
    const existing = await prisma.meetGroup.findFirst({
      where: { id: req.params.groupId, teamId: req.user.teamId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Meet group not found' });
    }

    const updates = {};
    if (groupName !== undefined) updates.groupName = groupName;
    if (description !== undefined) updates.description = description;

    const updatedGroup = await prisma.meetGroup.update({ where: { id: existing.id }, data: updates });

    res.json({
      success: true,
      data: { id: updatedGroup.id, groupName: updatedGroup.groupName, description: updatedGroup.description },
    });
  } catch (error) {
    logger.error(`Error updating meet group: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to update meet group' });
  }
});

// DELETE /api/meet-groups/:groupId
router.delete('/:groupId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const existing = await prisma.meetGroup.findFirst({
      where: { id: req.params.groupId, teamId: req.user.teamId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Meet group not found' });
    }

    await prisma.meetGroup.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Meet group deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting meet group: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to delete meet group' });
  }
});

// POST /api/meet-groups/:groupId/races
router.post('/:groupId/races', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { raceId } = req.body;

  if (!raceId) {
    return res.status(400).json({ success: false, message: 'Race ID is required' });
  }

  try {
    const group = await prisma.meetGroup.findFirst({ where: { id: req.params.groupId, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Meet group not found' });
    }

    const race = await prisma.race.findFirst({ where: { id: raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ success: false, message: 'Race not found' });
    }

    await prisma.meetGroupRace.upsert({
      where: { meetGroupId_raceId: { meetGroupId: group.id, raceId } },
      update: {},
      create: { meetGroupId: group.id, raceId },
    });

    res.status(201).json({ success: true, message: 'Race added to meet group successfully' });
  } catch (error) {
    logger.error(`Error adding race to meet group: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to add race to meet group' });
  }
});

// DELETE /api/meet-groups/:groupId/races/:raceId
router.delete('/:groupId/races/:raceId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const group = await prisma.meetGroup.findFirst({ where: { id: req.params.groupId, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ success: false, message: 'Meet group not found' });
    }

    await prisma.meetGroupRace.deleteMany({ where: { meetGroupId: group.id, raceId: req.params.raceId } });
    res.json({ success: true, message: 'Race removed from meet group successfully' });
  } catch (error) {
    logger.error(`Error removing race from meet group: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to remove race from meet group' });
  }
});

// GET /api/meet-groups/ungrouped-races
router.get('/ungrouped-races', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;

    const allRaces = await prisma.race.findMany({
      where: { teamId },
      select: { id: true, name: true, season: true, date: true },
      orderBy: [{ season: 'desc' }, { date: 'desc' }],
    });

    const groupedRaceLinks = await prisma.meetGroupRace.findMany({
      where: { meetGroup: { teamId } },
      select: { raceId: true },
    });

    const groupedRaceIds = new Set(groupedRaceLinks.map((gr) => gr.raceId));
    const ungroupedRaces = allRaces.filter((race) => !groupedRaceIds.has(race.id));

    res.json({ success: true, data: ungroupedRaces });
  } catch (error) {
    logger.error(`Error fetching ungrouped races: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch ungrouped races' });
  }
});

module.exports = router;
