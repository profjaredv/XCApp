const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { getGroupOn, moveAthleteToGroup } = require('../lib/groups');
const { decideCanManageGroup } = require('../lib/groupPermissions');

const GROUP_TYPES = new Set(['TRAINING', 'CAPTAIN', 'CUSTOM']);

// A head/paid coach can manage any group on their team. A volunteer coach
// can only manage a group they actually lead — T2 is the first place
// VOLUNTEER_COACH's group-scoped access (per its TeamRole comment in
// schema.prisma) becomes a real, checkable thing rather than a role with
// nowhere to apply. Not folded into requireRole: this is a data-scoped
// check (does a GroupLeader row exist for THIS group), not a route-level
// role gate. The actual decision logic lives in lib/groupPermissions.js,
// DB-free and unit-tested; this just fetches what it needs.
async function canManageGroup(req, groupId) {
  const [membership, leaderRow] = await Promise.all([
    prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } } }),
    prisma.groupLeader.findFirst({ where: { groupId, userId: req.user.id } }),
  ]);
  return decideCanManageGroup({
    isOwner: req.user.team?.coachUid === req.user.id,
    membership,
    isGroupLeader: Boolean(leaderRow),
  });
}

// GET /api/groups?seasonId=
router.get('/', authenticate, requireTeam, async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const groups = await prisma.group.findMany({
      where: { seasonId },
      include: {
        leaders: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { memberships: { where: { endDate: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        gender: g.gender,
        sortOrder: g.sortOrder,
        color: g.color,
        archived: g.archived,
        activeMemberCount: g._count.memberships,
        leaders: g.leaders.map((l) => ({ userId: l.userId, name: l.user.name, email: l.user.email, primary: l.primary })),
      }))
    );
  } catch (error) {
    console.error('Error fetching groups:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/:id/members
// Roster-assignment-screen shaped: each athlete's most recent season-best
// time, per the doc ("Show each athlete's most recent season-best time on
// their card").
router.get('/:id/members', authenticate, requireTeam, async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }

    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: group.id, endDate: null },
      include: { athlete: { select: { id: true, name: true, gender: true, grade: true, graduationYear: true } } },
    });

    res.json(
      memberships.map((m) => ({
        membershipId: m.id,
        athleteId: m.athleteId,
        name: m.athlete.name,
        gender: m.athlete.gender,
        grade: m.athlete.grade,
        startDate: m.startDate,
      }))
    );
  } catch (error) {
    console.error('Error fetching group members:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/groups/athlete/:athleteId/current
// A concrete consumer of getGroupOn, not just its own test — "today" is
// the overwhelmingly common query, e.g. for showing an athlete their own
// current group.
router.get('/athlete/:athleteId/current', authenticate, requireTeam, async (req, res) => {
  const { date, type = 'TRAINING' } = req.query;
  if (!GROUP_TYPES.has(type)) {
    return res.status(400).json({ msg: `type must be one of: ${[...GROUP_TYPES].join(', ')}` });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const membership = await getGroupOn(athlete.id, date ? new Date(date) : new Date(), type);
    if (!membership) {
      return res.json({ group: null });
    }
    res.json({
      group: { id: membership.group.id, name: membership.group.name, type: membership.group.type },
      since: membership.startDate,
    });
  } catch (error) {
    console.error('Error resolving athlete\'s current group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups
router.post('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { seasonId, name, type, gender, sortOrder, color } = req.body;

  if (!seasonId || !name || !GROUP_TYPES.has(type)) {
    return res.status(400).json({ msg: `seasonId, name, and type (one of ${[...GROUP_TYPES].join(', ')}) are required.` });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const group = await prisma.group.create({
      data: {
        teamId: req.user.teamId,
        seasonId,
        name,
        type,
        gender: gender || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        color: color || null,
      },
    });
    res.status(201).json(group);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'A group with that name already exists for this season.' });
    }
    console.error('Error creating group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/groups/:id
router.put('/:id', authenticate, requireTeam, async (req, res) => {
  const { name, sortOrder, color, archived } = req.body;

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    if (!(await canManageGroup(req, group.id))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (color !== undefined) updates.color = color;
    if (archived !== undefined) updates.archived = Boolean(archived);

    const updated = await prisma.group.update({ where: { id: group.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    await prisma.group.delete({ where: { id: group.id } });
    res.json({ msg: 'Group deleted.' });
  } catch (error) {
    console.error('Error deleting group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/:id/leaders
// Staff assignment stays coach-level even though editing the group's own
// content (PUT above) can be delegated to a volunteer who already leads it.
router.post('/:id/leaders', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { userId, primary } = req.body;
  if (!userId) {
    return res.status(400).json({ msg: 'userId is required.' });
  }

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.user.teamId, userId } },
    });
    if (!membership || membership.role === 'ATHLETE') {
      return res.status(400).json({ msg: 'That user is not on the coaching staff for this team.' });
    }

    await prisma.$transaction(async (tx) => {
      // Exactly one primary leader per group, enforced here rather than
      // left to the database (which can't express "exactly one true" as a
      // constraint) — per the doc's own instruction.
      if (primary) {
        await tx.groupLeader.updateMany({ where: { groupId: group.id }, data: { primary: false } });
      }
      await tx.groupLeader.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        update: { primary: Boolean(primary) },
        create: { groupId: group.id, userId, primary: Boolean(primary) },
      });
    });

    res.status(201).json({ msg: 'Leader assigned.' });
  } catch (error) {
    console.error('Error assigning group leader:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/groups/:id/leaders/:userId
router.delete('/:id/leaders/:userId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    await prisma.groupLeader.deleteMany({ where: { groupId: group.id, userId: req.params.userId } });
    res.json({ msg: 'Leader removed.' });
  } catch (error) {
    console.error('Error removing group leader:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/:id/members
// Move ONE athlete into this group, effective-dated (see lib/groups.js —
// this never updates an existing membership's groupId, it closes the old
// row and opens a new one). Available to a volunteer coach only for a
// group they lead.
router.post('/:id/members', authenticate, requireTeam, async (req, res) => {
  const { athleteId, effectiveDate, reason } = req.body;
  if (!athleteId) {
    return res.status(400).json({ msg: 'athleteId is required.' });
  }

  try {
    const group = await prisma.group.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!group) {
      return res.status(404).json({ msg: 'Group not found.' });
    }
    if (!(await canManageGroup(req, group.id))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    const membership = await moveAthleteToGroup({
      athleteId,
      groupId: group.id,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      movedById: req.user.id,
      reason: reason || null,
    });

    res.status(201).json(membership);
  } catch (error) {
    console.error('Error moving athlete to group:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/assign
// The bulk assignment screen's save action: every change in one
// transaction, per the doc ("Save writes all changes in one transaction").
// Head/paid-coach only — a volunteer coach moving athletes one at a time
// into their own group uses POST /:id/members above instead.
router.post('/assign', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { assignments, effectiveDate } = req.body;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ msg: 'assignments array is required.' });
  }

  try {
    const athleteIds = assignments.map((a) => a.athleteId);
    const groupIds = [...new Set(assignments.map((a) => a.groupId))];

    const [athletes, groups] = await Promise.all([
      prisma.athlete.findMany({ where: { id: { in: athleteIds }, teamId: req.user.teamId }, select: { id: true } }),
      prisma.group.findMany({ where: { id: { in: groupIds }, teamId: req.user.teamId }, select: { id: true, type: true } }),
    ]);
    const validAthleteIds = new Set(athletes.map((a) => a.id));
    const groupById = new Map(groups.map((g) => [g.id, g]));

    const invalid = assignments.filter((a) => !validAthleteIds.has(a.athleteId) || !groupById.has(a.groupId));
    if (invalid.length > 0) {
      return res.status(400).json({ msg: 'One or more athletes/groups do not belong to your team.', invalid });
    }

    const date = effectiveDate ? new Date(effectiveDate) : new Date();
    const results = [];
    await prisma.$transaction(async (tx) => {
      for (const { athleteId, groupId } of assignments) {
        // Inline rather than calling moveAthleteToGroup so every write in
        // this bulk save shares the same transaction (moveAthleteToGroup
        // opens its own — nesting prisma transactions isn't supported).
        const targetType = groupById.get(groupId).type;

        const currentlyActive = await tx.groupMembership.findMany({
          where: { athleteId, endDate: null, group: { type: targetType } },
        });
        for (const membership of currentlyActive) {
          if (membership.groupId === groupId) continue;
          await tx.groupMembership.update({ where: { id: membership.id }, data: { endDate: date } });
        }
        const alreadyHere = currentlyActive.some((m) => m.groupId === groupId);
        if (!alreadyHere) {
          const created = await tx.groupMembership.create({
            data: { groupId, athleteId, startDate: date, movedById: req.user.id },
          });
          results.push(created);
        }
      }
    });

    res.status(201).json({ msg: `Assigned ${results.length} athletes.`, count: results.length });
  } catch (error) {
    console.error('Error bulk-assigning groups:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/groups/copy-from-season
// Pre-populates a new season's groups (and, best-effort, memberships) from
// a previous season — "most athletes stay put," so this is a starting
// point for the bulk screen, not a guarantee. Only carries an athlete
// forward if they're also on the target season's active roster (some may
// have graduated).
router.post('/copy-from-season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { fromSeasonId, toSeasonId } = req.body;
  if (!fromSeasonId || !toSeasonId) {
    return res.status(400).json({ msg: 'fromSeasonId and toSeasonId are required.' });
  }

  try {
    const [fromSeason, toSeason] = await Promise.all([
      prisma.season.findFirst({ where: { id: fromSeasonId, teamId: req.user.teamId } }),
      prisma.season.findFirst({ where: { id: toSeasonId, teamId: req.user.teamId } }),
    ]);
    if (!fromSeason || !toSeason) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const sourceGroups = await prisma.group.findMany({ where: { seasonId: fromSeasonId, archived: false } });
    const toRoster = await prisma.seasonRoster.findMany({ where: { seasonId: toSeasonId, isActive: true }, select: { athleteId: true } });
    const toRosterAthleteIds = new Set(toRoster.map((r) => r.athleteId));

    let groupsCreated = 0;
    let membershipsCreated = 0;

    await prisma.$transaction(async (tx) => {
      for (const source of sourceGroups) {
        const newGroup = await tx.group.upsert({
          where: { seasonId_name: { seasonId: toSeasonId, name: source.name } },
          update: {},
          create: {
            teamId: req.user.teamId,
            seasonId: toSeasonId,
            name: source.name,
            type: source.type,
            gender: source.gender,
            sortOrder: source.sortOrder,
            color: source.color,
          },
        });
        groupsCreated++;

        const activeMembers = await tx.groupMembership.findMany({
          where: { groupId: source.id, endDate: null },
          select: { athleteId: true },
        });
        for (const { athleteId } of activeMembers) {
          if (!toRosterAthleteIds.has(athleteId)) continue; // graduated / not on the new roster
          const existing = await tx.groupMembership.findFirst({
            where: { athleteId, endDate: null, group: { type: newGroup.type, seasonId: toSeasonId } },
          });
          if (existing) continue;
          await tx.groupMembership.create({
            data: { groupId: newGroup.id, athleteId, startDate: toSeason.startDate || new Date(), movedById: req.user.id, reason: `Copied from ${fromSeason.year}` },
          });
          membershipsCreated++;
        }
      }
    });

    res.status(201).json({ msg: `Copied ${groupsCreated} groups and ${membershipsCreated} memberships.`, groupsCreated, membershipsCreated });
  } catch (error) {
    console.error('Error copying groups from season:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
