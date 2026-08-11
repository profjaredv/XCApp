const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const { decideCanManagePracticePlanRow } = require('../lib/groupPermissions');
const { getGroupOn } = require('../lib/groups');

// Same shape as T2's canManageGroup, extended for team-wide (groupId null)
// rows via decideCanManagePracticePlanRow — the actual decision logic is
// DB-free and unit-tested on its own (rule 5); this just fetches what it
// needs.
async function canManageGroupOrTeamWide(req, groupId) {
  const [membership, leaderRow] = await Promise.all([
    prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } } }),
    groupId ? prisma.groupLeader.findFirst({ where: { groupId, userId: req.user.id } }) : Promise.resolve(null),
  ]);
  return decideCanManagePracticePlanRow({
    groupId,
    isOwner: req.user.team?.coachUid === req.user.id,
    membership,
    isGroupLeader: Boolean(leaderRow),
  });
}

async function ledGroupIds(userId) {
  const rows = await prisma.groupLeader.findMany({ where: { userId }, select: { groupId: true } });
  return rows.map((r) => r.groupId);
}

// GET /api/practice-plans?seasonId=&from=&to=
// The coach composer's week-at-a-glance data. HEAD_COACH/COACH see every
// group's assignments; a VOLUNTEER_COACH sees only their own groups' rows
// (plus team-wide) — "sees and edits only rows targeting their own
// groups," per the doc, applies to reads here as much as writes below.
router.get('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']), async (req, res) => {
  const { seasonId, from, to } = req.query;
  if (!seasonId || !from || !to) {
    return res.status(400).json({ msg: 'seasonId, from, and to are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } },
    });
    const isOwner = req.user.team?.coachUid === req.user.id;
    const isVolunteerOnly = !isOwner && membership?.role === 'VOLUNTEER_COACH';

    const plans = await prisma.practicePlan.findMany({
      where: { seasonId, date: { gte: new Date(from), lte: new Date(to) } },
      include: {
        assignments: { include: { group: { select: { id: true, name: true, gender: true } } }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { date: 'asc' },
    });

    let scopedGroupIds = null;
    if (isVolunteerOnly) {
      scopedGroupIds = new Set(await ledGroupIds(req.user.id));
    }

    res.json(
      plans.map((plan) => ({
        id: plan.id,
        date: plan.date,
        title: plan.title,
        teamNotes: plan.teamNotes,
        location: plan.location,
        startTime: plan.startTime,
        published: plan.published,
        assignments: plan.assignments
          .filter((a) => !scopedGroupIds || a.groupId === null || scopedGroupIds.has(a.groupId))
          .map((a) => ({
            id: a.id,
            groupId: a.groupId,
            groupName: a.group?.name ?? 'Whole Team',
            volumeTier: a.volumeTier,
            focus: a.focus,
            durationMinutes: a.durationMinutes,
            distanceMi: a.distanceMi,
            strength: a.strength,
            details: a.details,
            sortOrder: a.sortOrder,
          })),
      }))
    );
  } catch (error) {
    console.error('Error fetching practice plans:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/practice-plans/mine?date=
// The athlete phone screen: today's (or a given date's) plan, filtered to
// team-wide rows plus the athlete's own current TRAINING group — nothing
// else, and only once published.
router.get('/mine', authenticate, requireLinkedAthlete, async (req, res) => {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();

  try {
    const season = await prisma.season.findFirst({
      where: { teamId: req.user.teamId, isActive: true },
    });
    if (!season) {
      return res.json({ date: dateParam, plan: null });
    }

    const plan = await prisma.practicePlan.findFirst({
      where: { seasonId: season.id, date: dateParam, published: true },
      include: { assignments: { include: { group: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!plan) {
      return res.json({ date: dateParam, plan: null });
    }

    const currentMembership = await getGroupOn(req.user.linkedAthlete.id, dateParam, 'TRAINING');
    const myGroupId = currentMembership?.group.id ?? null;

    const rows = plan.assignments.filter((a) => a.groupId === null || a.groupId === myGroupId);

    res.json({
      date: plan.date,
      plan: {
        title: plan.title,
        teamNotes: plan.teamNotes,
        location: plan.location,
        startTime: plan.startTime,
        assignments: rows.map((a) => ({
          focus: a.focus,
          durationMinutes: a.durationMinutes,
          distanceMi: a.distanceMi,
          strength: a.strength,
          details: a.details,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching athlete practice plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans
// Creates/updates a day's shell (title, notes, location, time). Head/paid
// coach only — a volunteer's authority doesn't extend to the whole day,
// only to their own groups' assignment rows (see POST .../assignments).
router.post('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { seasonId, date, title, teamNotes, location, startTime } = req.body;
  if (!seasonId || !date) {
    return res.status(400).json({ msg: 'seasonId and date are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const normalizedDate = new Date(date);
    const plan = await prisma.practicePlan.upsert({
      where: { seasonId_date: { seasonId, date: normalizedDate } },
      update: { title, teamNotes, location, startTime },
      create: {
        teamId: req.user.teamId,
        seasonId,
        date: normalizedDate,
        title,
        teamNotes,
        location,
        startTime,
        createdById: req.user.id,
      },
    });
    res.status(201).json(plan);
  } catch (error) {
    console.error('Error saving practice plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/practice-plans/:id/publish
router.put('/:id/publish', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { published } = req.body;
  try {
    const plan = await prisma.practicePlan.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!plan) {
      return res.status(404).json({ msg: 'Plan not found.' });
    }
    const updated = await prisma.practicePlan.update({ where: { id: plan.id }, data: { published: Boolean(published) } });
    res.json(updated);
  } catch (error) {
    console.error('Error publishing practice plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans/:id/assignments
// If templateId is given, its fields are COPIED into the new row — no
// reference to the template is ever stored (see WorkoutTemplate's schema
// comment). Body fields override the template's where both are present,
// so "insert then tweak" works in one call.
router.post('/:id/assignments', authenticate, requireTeam, async (req, res) => {
  const { groupId, templateId, volumeTier, focus, durationMinutes, distanceMi, strength, details, sortOrder } = req.body;

  try {
    const plan = await prisma.practicePlan.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!plan) {
      return res.status(404).json({ msg: 'Plan not found.' });
    }
    if (groupId) {
      const group = await prisma.group.findFirst({ where: { id: groupId, teamId: req.user.teamId } });
      if (!group) {
        return res.status(404).json({ msg: 'Group not found.' });
      }
    }
    if (!(await canManageGroupOrTeamWide(req, groupId ?? null))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }

    let templateFields = {};
    if (templateId) {
      const template = await prisma.workoutTemplate.findFirst({ where: { id: templateId, teamId: req.user.teamId } });
      if (!template) {
        return res.status(404).json({ msg: 'Template not found.' });
      }
      templateFields = {
        volumeTier: template.volumeTier,
        focus: template.focus,
        durationMinutes: template.durationMinutes,
        distanceMi: template.distanceMi,
        strength: template.strength,
        details: template.details,
      };
    }

    const assignment = await prisma.practicePlanAssignment.create({
      data: {
        practicePlanId: plan.id,
        groupId: groupId || null,
        volumeTier: volumeTier ?? templateFields.volumeTier ?? null,
        focus: focus ?? templateFields.focus ?? null,
        durationMinutes: durationMinutes ?? templateFields.durationMinutes ?? null,
        distanceMi: distanceMi ?? templateFields.distanceMi ?? null,
        strength: strength ?? templateFields.strength ?? false,
        details: details ?? templateFields.details ?? null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    });
    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error creating assignment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/practice-plans/assignments/:assignmentId
router.put('/assignments/:assignmentId', authenticate, requireTeam, async (req, res) => {
  const { volumeTier, focus, durationMinutes, distanceMi, strength, details, sortOrder } = req.body;

  try {
    const assignment = await prisma.practicePlanAssignment.findFirst({
      where: { id: req.params.assignmentId, practicePlan: { teamId: req.user.teamId } },
    });
    if (!assignment) {
      return res.status(404).json({ msg: 'Assignment not found.' });
    }
    if (!(await canManageGroupOrTeamWide(req, assignment.groupId))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }

    const updates = {};
    if (volumeTier !== undefined) updates.volumeTier = volumeTier;
    if (focus !== undefined) updates.focus = focus;
    if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
    if (distanceMi !== undefined) updates.distanceMi = distanceMi;
    if (strength !== undefined) updates.strength = strength;
    if (details !== undefined) updates.details = details;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const updated = await prisma.practicePlanAssignment.update({ where: { id: assignment.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating assignment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/practice-plans/assignments/:assignmentId
router.delete('/assignments/:assignmentId', authenticate, requireTeam, async (req, res) => {
  try {
    const assignment = await prisma.practicePlanAssignment.findFirst({
      where: { id: req.params.assignmentId, practicePlan: { teamId: req.user.teamId } },
    });
    if (!assignment) {
      return res.status(404).json({ msg: 'Assignment not found.' });
    }
    if (!(await canManageGroupOrTeamWide(req, assignment.groupId))) {
      return res.status(403).json({ msg: 'You do not lead this group.' });
    }
    await prisma.practicePlanAssignment.delete({ where: { id: assignment.id } });
    res.json({ msg: 'Deleted.' });
  } catch (error) {
    console.error('Error deleting assignment:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans/:id/duplicate-day
// Copies every assignment; lands unpublished regardless of the source's
// state, per the doc, so the coach reviews before athletes see it.
router.post('/:id/duplicate-day', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { toDate, toSeasonId } = req.body;
  if (!toDate) {
    return res.status(400).json({ msg: 'toDate is required.' });
  }

  try {
    const source = await prisma.practicePlan.findFirst({
      where: { id: req.params.id, teamId: req.user.teamId },
      include: { assignments: true },
    });
    if (!source) {
      return res.status(404).json({ msg: 'Source plan not found.' });
    }
    const targetSeasonId = toSeasonId || source.seasonId;
    const targetSeason = await prisma.season.findFirst({ where: { id: targetSeasonId, teamId: req.user.teamId } });
    if (!targetSeason) {
      return res.status(404).json({ msg: 'Target season not found.' });
    }

    const normalizedDate = new Date(toDate);
    const newPlan = await prisma.$transaction(async (tx) => {
      const plan = await tx.practicePlan.upsert({
        where: { seasonId_date: { seasonId: targetSeasonId, date: normalizedDate } },
        update: { published: false },
        create: {
          teamId: req.user.teamId,
          seasonId: targetSeasonId,
          date: normalizedDate,
          title: source.title,
          teamNotes: source.teamNotes,
          location: source.location,
          startTime: source.startTime,
          published: false,
          createdById: req.user.id,
        },
      });
      for (const a of source.assignments) {
        await tx.practicePlanAssignment.create({
          data: {
            practicePlanId: plan.id,
            groupId: a.groupId,
            volumeTier: a.volumeTier,
            focus: a.focus,
            durationMinutes: a.durationMinutes,
            distanceMi: a.distanceMi,
            strength: a.strength,
            details: a.details,
            sortOrder: a.sortOrder,
          },
        });
      }
      return plan;
    });

    res.status(201).json(newPlan);
  } catch (error) {
    console.error('Error duplicating day:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans/duplicate-week
// Offsets all seven days by the same delta. Only days that actually have a
// plan get copied; a week partially planned stays partially planned.
router.post('/duplicate-week', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { seasonId, fromWeekStart, toWeekStart, toSeasonId } = req.body;
  if (!seasonId || !fromWeekStart || !toWeekStart) {
    return res.status(400).json({ msg: 'seasonId, fromWeekStart, and toWeekStart are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    const targetSeasonId = toSeasonId || seasonId;
    const targetSeason = await prisma.season.findFirst({ where: { id: targetSeasonId, teamId: req.user.teamId } });
    if (!targetSeason) {
      return res.status(404).json({ msg: 'Target season not found.' });
    }

    const from = new Date(fromWeekStart);
    const to = new Date(toWeekStart);
    const offsetMs = to.getTime() - from.getTime();

    const sourcePlans = await prisma.practicePlan.findMany({
      where: {
        seasonId,
        date: { gte: from, lt: new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
      include: { assignments: true },
    });

    const created = [];
    await prisma.$transaction(async (tx) => {
      for (const source of sourcePlans) {
        const newDate = new Date(source.date.getTime() + offsetMs);
        const plan = await tx.practicePlan.upsert({
          where: { seasonId_date: { seasonId: targetSeasonId, date: newDate } },
          update: { published: false },
          create: {
            teamId: req.user.teamId,
            seasonId: targetSeasonId,
            date: newDate,
            title: source.title,
            teamNotes: source.teamNotes,
            location: source.location,
            startTime: source.startTime,
            published: false,
            createdById: req.user.id,
          },
        });
        for (const a of source.assignments) {
          await tx.practicePlanAssignment.create({
            data: {
              practicePlanId: plan.id,
              groupId: a.groupId,
              volumeTier: a.volumeTier,
              focus: a.focus,
              durationMinutes: a.durationMinutes,
              distanceMi: a.distanceMi,
              strength: a.strength,
              details: a.details,
              sortOrder: a.sortOrder,
            },
          });
        }
        created.push(plan);
      }
    });

    res.status(201).json({ msg: `Duplicated ${created.length} days.`, count: created.length });
  } catch (error) {
    console.error('Error duplicating week:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
