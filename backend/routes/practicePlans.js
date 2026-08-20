const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');

// Schedule rework (2026-08-20 request): one shared plan per day, not a
// per-group row with granular tier/focus/duration/distance fields — see
// schema.prisma's PracticePlan comment. Editing the day's plan is
// HEAD_COACH/COACH only now; there's no more per-group scope for a
// VOLUNTEER_COACH's authority to attach to (the old assignment-level
// group-leader carve-out is gone along with the assignments themselves).

const INCLUDE = {
  location: { select: { id: true, name: true } },
  workoutTemplate: { select: { id: true, name: true, volumeTier: true, focus: true, durationMinutes: true, distanceMi: true, strength: true, details: true } },
  intervalSession: { select: { id: true, title: true, groupId: true, repDistanceM: true, zone: true, group: { select: { name: true } } } },
};

function serializePlan(plan) {
  return {
    id: plan.id,
    date: plan.date,
    published: plan.published,
    startTime: plan.startTime,
    locationId: plan.locationId,
    locationName: plan.location?.name ?? null,
    announcements: plan.announcements,
    preRun: plan.preRun,
    run: plan.run,
    postRun: plan.postRun,
    workoutTemplateId: plan.workoutTemplateId,
    workoutTemplate: plan.workoutTemplate
      ? {
          id: plan.workoutTemplate.id,
          name: plan.workoutTemplate.name,
          volumeTier: plan.workoutTemplate.volumeTier,
          focus: plan.workoutTemplate.focus,
          durationMinutes: plan.workoutTemplate.durationMinutes,
          distanceMi: plan.workoutTemplate.distanceMi,
          strength: plan.workoutTemplate.strength,
          details: plan.workoutTemplate.details,
        }
      : null,
    intervalSessionId: plan.intervalSessionId,
    intervalSession: plan.intervalSession
      ? {
          id: plan.intervalSession.id,
          title: plan.intervalSession.title,
          groupId: plan.intervalSession.groupId,
          groupName: plan.intervalSession.group?.name ?? null,
          repDistanceM: plan.intervalSession.repDistanceM,
          zone: plan.intervalSession.zone,
        }
      : null,
  };
}

// GET /api/practice-plans?seasonId=&from=&to= — the Schedule calendar's data
// for a date range (typically one visible month).
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

    const plans = await prisma.practicePlan.findMany({
      where: { seasonId, date: { gte: new Date(from), lte: new Date(to) } },
      include: INCLUDE,
      orderBy: { date: 'asc' },
    });

    res.json(plans.map(serializePlan));
  } catch (error) {
    console.error('Error fetching practice plans:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/practice-plans/mine?date= — the athlete phone screen. One shared
// plan for the whole team now, so this is just "does today have a
// published plan," no per-group filtering left to do.
router.get('/mine', authenticate, requireLinkedAthlete, async (req, res) => {
  const dateParam = req.query.date ? new Date(req.query.date) : new Date();

  try {
    const season = await prisma.season.findFirst({ where: { teamId: req.user.teamId, isActive: true } });
    if (!season) {
      return res.json({ date: dateParam, plan: null });
    }

    const plan = await prisma.practicePlan.findFirst({
      where: { seasonId: season.id, date: dateParam, published: true },
      include: INCLUDE,
    });

    res.json({ date: dateParam, plan: plan ? serializePlan(plan) : null });
  } catch (error) {
    console.error('Error fetching athlete practice plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans — upsert a day's plan (all fields at once; the
// Schedule day-editor sends the whole form every save).
router.post('/', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { seasonId, date, locationId, startTime, announcements, preRun, run, postRun, workoutTemplateId, intervalSessionId } = req.body;
  if (!seasonId || !date) {
    return res.status(400).json({ msg: 'seasonId and date are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    if (locationId) {
      const location = await prisma.practiceLocation.findFirst({ where: { id: locationId, teamId: req.user.teamId } });
      if (!location) return res.status(404).json({ msg: 'Location not found.' });
    }
    if (workoutTemplateId) {
      const template = await prisma.workoutTemplate.findFirst({ where: { id: workoutTemplateId, teamId: req.user.teamId } });
      if (!template) return res.status(404).json({ msg: 'Workout template not found.' });
    }
    if (intervalSessionId) {
      const session = await prisma.intervalSession.findFirst({ where: { id: intervalSessionId, teamId: req.user.teamId } });
      if (!session) return res.status(404).json({ msg: 'Interval session not found.' });
    }

    const fields = {
      locationId: locationId || null,
      startTime: startTime ?? null,
      announcements: announcements ?? null,
      preRun: preRun ?? null,
      run: run ?? null,
      postRun: postRun ?? null,
      workoutTemplateId: workoutTemplateId || null,
      intervalSessionId: intervalSessionId || null,
    };

    const normalizedDate = new Date(date);
    const plan = await prisma.practicePlan.upsert({
      where: { seasonId_date: { seasonId, date: normalizedDate } },
      update: fields,
      create: { teamId: req.user.teamId, seasonId, date: normalizedDate, createdById: req.user.id, ...fields },
      include: INCLUDE,
    });
    res.status(201).json(serializePlan(plan));
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
    const updated = await prisma.practicePlan.update({
      where: { id: plan.id },
      data: { published: Boolean(published) },
      include: INCLUDE,
    });
    res.json(serializePlan(updated));
  } catch (error) {
    console.error('Error publishing practice plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/practice-plans/:id/duplicate-day
// Copies the day's shell fields (including the attached template, but NOT
// the attached interval session — a rep-tracking sheet belongs to the day
// it was actually run, not a fresh copy of it). Lands unpublished
// regardless of the source's state, so the coach reviews before athletes see it.
router.post('/:id/duplicate-day', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { toDate, toSeasonId } = req.body;
  if (!toDate) {
    return res.status(400).json({ msg: 'toDate is required.' });
  }

  try {
    const source = await prisma.practicePlan.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!source) {
      return res.status(404).json({ msg: 'Source plan not found.' });
    }
    const targetSeasonId = toSeasonId || source.seasonId;
    const targetSeason = await prisma.season.findFirst({ where: { id: targetSeasonId, teamId: req.user.teamId } });
    if (!targetSeason) {
      return res.status(404).json({ msg: 'Target season not found.' });
    }

    const normalizedDate = new Date(toDate);
    const fields = {
      locationId: source.locationId,
      startTime: source.startTime,
      announcements: source.announcements,
      preRun: source.preRun,
      run: source.run,
      postRun: source.postRun,
      workoutTemplateId: source.workoutTemplateId,
      published: false,
    };
    const plan = await prisma.practicePlan.upsert({
      where: { seasonId_date: { seasonId: targetSeasonId, date: normalizedDate } },
      update: fields,
      create: { teamId: req.user.teamId, seasonId: targetSeasonId, date: normalizedDate, createdById: req.user.id, ...fields },
      include: INCLUDE,
    });

    res.status(201).json(serializePlan(plan));
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
      where: { seasonId, date: { gte: from, lt: new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    });

    let count = 0;
    await prisma.$transaction(async (tx) => {
      for (const source of sourcePlans) {
        const newDate = new Date(source.date.getTime() + offsetMs);
        await tx.practicePlan.upsert({
          where: { seasonId_date: { seasonId: targetSeasonId, date: newDate } },
          update: {
            locationId: source.locationId,
            startTime: source.startTime,
            announcements: source.announcements,
            preRun: source.preRun,
            run: source.run,
            postRun: source.postRun,
            workoutTemplateId: source.workoutTemplateId,
            published: false,
          },
          create: {
            teamId: req.user.teamId,
            seasonId: targetSeasonId,
            date: newDate,
            locationId: source.locationId,
            startTime: source.startTime,
            announcements: source.announcements,
            preRun: source.preRun,
            run: source.run,
            postRun: source.postRun,
            workoutTemplateId: source.workoutTemplateId,
            published: false,
            createdById: req.user.id,
          },
        });
        count += 1;
      }
    });

    res.status(201).json({ msg: `Duplicated ${count} days.`, count });
  } catch (error) {
    console.error('Error duplicating week:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
