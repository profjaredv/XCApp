const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { resolveTodaySeasonState } = require('../lib/season');

// Workstream A (LeadPack Master Build Handoff): the Today page's backend.
// Each block on the page fetches independently, so this file is several
// small endpoints rather than one aggregate — a slow query on one block
// must never blank the rest of the page. Athlete-view blocks reuse
// existing endpoints wholesale (practice-plans/mine, meet-ops/mine,
// athletes/:id/races) rather than duplicating them here; only the
// genuinely new aggregations (season-state gate, next-meet-with-counts,
// needs-attention, recent-result) get new routes.
const COACH_ROLES = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'];

function normalizeToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// GET /api/today/season — the page-level gate every other block depends on.
router.get('/season', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const result = await resolveTodaySeasonState(req.user.teamId);
    res.json(result);
  } catch (error) {
    console.error('Error resolving today season state:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/today/meet?seasonId= — nearest upcoming meet with entry counts
// per race, so a coach doesn't have to open Meets to see whether entries
// are in. Athlete view doesn't need this: GET /api/meet-ops/mine already
// does the same job scoped to one athlete.
router.get('/meet', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const today = normalizeToday();
    const meet = await prisma.meet.findFirst({
      where: { seasonId, date: { gte: today } },
      orderBy: { date: 'asc' },
      include: {
        races: { select: { id: true, name: true } },
        plan: { select: { published: true } },
      },
    });

    if (!meet) {
      return res.json({ meet: null });
    }

    const raceIds = meet.races.map((r) => r.id);
    const entries = raceIds.length
      ? await prisma.meetEntry.groupBy({ by: ['raceId', 'status'], where: { raceId: { in: raceIds } }, _count: true })
      : [];

    const enteredByRace = new Map();
    for (const row of entries) {
      if (row.status !== 'ENTERED') continue;
      enteredByRace.set(row.raceId, (enteredByRace.get(row.raceId) ?? 0) + row._count);
    }

    const daysUntil = Math.round((new Date(meet.date) - today) / (1000 * 60 * 60 * 24));

    res.json({
      meet: {
        id: meet.id,
        name: meet.name,
        date: meet.date,
        location: meet.location,
        daysUntil,
        planPublished: meet.plan?.published ?? false,
        races: meet.races.map((r) => ({ id: r.id, name: r.name, enteredCount: enteredByRace.get(r.id) ?? 0 })),
      },
    });
  } catch (error) {
    console.error('Error fetching today meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/today/attention?seasonId= — up to 5 actionable items, coach
// only. Deliberately returns nothing rather than a manufactured "all
// clear" item when nothing qualifies — an empty area is the reward, per
// the governing rule for this page.
router.get('/attention', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const teamId = req.user.teamId;
    const today = normalizeToday();
    const tomorrow = addDays(today, 1);
    const weekAgo = addDays(today, -7);
    const weekAhead = addDays(today, 7);

    const [racesNeedingSplits, meetsNeedingEntries, tomorrowPlan, overdueEquipment] = await Promise.all([
      prisma.race.findMany({
        where: {
          teamId,
          date: { gte: weekAgo, lte: today },
          results: { some: { status: 'FINISHED' } },
          raceSplits: { none: {} },
        },
        select: { id: true, name: true, date: true },
        orderBy: { date: 'desc' },
      }),
      prisma.meet.findMany({
        where: {
          teamId,
          date: { gte: today, lte: weekAhead },
          races: { none: { meetEntries: { some: { status: 'ENTERED' } } } },
        },
        select: { id: true, name: true, date: true },
        orderBy: { date: 'asc' },
      }),
      prisma.practicePlan.findFirst({
        where: { teamId, date: tomorrow, published: false },
        select: { id: true, date: true },
      }),
      prisma.equipmentAssignment.findMany({
        where: { equipment: { teamId }, returnedAt: null, dueDate: { lt: today } },
        select: { id: true, dueDate: true, athlete: { select: { name: true } }, equipment: { select: { type: true, identifier: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);

    const items = [];
    for (const race of racesNeedingSplits) {
      items.push({ type: 'splits', label: `Enter splits for ${race.name}`, date: race.date, link: { raceId: race.id } });
    }
    for (const meet of meetsNeedingEntries) {
      items.push({ type: 'entries', label: `No entries yet for ${meet.name}`, date: meet.date, link: { meetId: meet.id } });
    }
    if (tomorrowPlan) {
      items.push({ type: 'unpublished-plan', label: "Tomorrow's practice plan is still a draft", date: tomorrowPlan.date, link: { practicePlanId: tomorrowPlan.id } });
    }
    for (const assignment of overdueEquipment) {
      items.push({
        type: 'overdue-equipment',
        label: `${assignment.athlete.name}: ${assignment.equipment.type} #${assignment.equipment.identifier} was due back`,
        date: assignment.dueDate,
        link: { equipmentAssignmentId: assignment.id },
      });
    }

    res.json({ items: items.slice(0, 5) });
  } catch (error) {
    console.error('Error fetching today attention items:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/today/recent-result?seasonId= — most recent race plus a
// one-line team summary, coach view. Athlete view uses
// GET /api/athletes/:athleteId/races?limit=1 instead.
router.get('/recent-result', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const today = normalizeToday();
    const race = await prisma.race.findFirst({
      where: { teamId: req.user.teamId, season: season.year, date: { lte: today } },
      orderBy: { date: 'desc' },
    });

    if (!race) {
      return res.json({ race: null });
    }

    const results = await prisma.result.findMany({
      where: { raceId: race.id, status: 'FINISHED', time: { gt: 0 } },
      select: { time: true },
    });

    const finisherCount = results.length;
    const avgTimeSec = finisherCount > 0 ? results.reduce((sum, r) => sum + r.time, 0) / finisherCount : null;

    res.json({
      race: { id: race.id, name: race.name, date: race.date, finisherCount, avgTimeSec },
    });
  } catch (error) {
    console.error('Error fetching today recent result:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
