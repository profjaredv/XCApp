const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { resolveTodaySeasonState, resolveActiveSeason } = require('../lib/season');
const { mergeStaffRoster } = require('../lib/teamStaff');
const { getGroupOn } = require('../lib/groups');
const { decideCanViewReflection } = require('../lib/raceReflections');
const { decideCanViewTrainingLog } = require('../lib/trainingLogSharing');

// Workstream A (LeadPack Master Build Handoff): the Today page's backend.
// Each block on the page fetches independently, so this file is several
// small endpoints rather than one aggregate — a slow query on one block
// must never blank the rest of the page. Athlete-view blocks reuse
// existing endpoints wholesale (practice-plans/mine, meet-ops/mine,
// athletes/:id/races) rather than duplicating them here; only the
// genuinely new aggregations (season-state gate, next-meet-with-counts,
// needs-attention, recent-result) get new routes.
const COACH_ROLES = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'];

// Resolves the requesting coach's own TeamRole the same way every other
// per-row-permission route in this codebase does (raceReflections.js,
// meetOps.js): the owner fast-path first, then a TeamMember lookup — see
// middleware/auth.js's hasTeamRole comment for why the fast path exists.
async function resolveViewerRole(req) {
  const isOwnerCoach = req.user.team?.coachUid === req.user.id;
  if (isOwnerCoach) return 'HEAD_COACH';
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } },
  });
  return membership?.role ?? null;
}

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

// GET /api/today/meet?seasonId= — nearest upcoming meet, so a coach
// doesn't have to open Schedule to see what's next. Athlete view doesn't
// need this: GET /api/meet-ops/mine already does the same job scoped to
// one athlete.
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
      },
    });

    if (!meet) {
      return res.json({ meet: null });
    }

    const daysUntil = Math.round((new Date(meet.date) - today) / (1000 * 60 * 60 * 24));

    res.json({
      meet: {
        id: meet.id,
        name: meet.name,
        date: meet.date,
        location: meet.location,
        isHome: meet.isHome,
        daysUntil,
        races: meet.races.map((r) => ({ id: r.id, name: r.name })),
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

    const [racesNeedingSplits, tomorrowPlan, overdueEquipment] = await Promise.all([
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

// GET /api/today/staff — coaching staff roster + athlete count. See
// lib/teamStaff.js for why the owner and the TeamMember table both have
// to be consulted and merged rather than just counting TeamMember rows.
//
// athleteCount is this SEASON's roster, not `athlete.count` — Athlete
// rows are never deleted (a graduated senior's history has to survive),
// so a bare count across the whole table is every athlete this team has
// ever had on file, across every imported year. That inflated the number
// the moment a team imported more than one season.
router.get('/staff', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const [team, members, activeSeason] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId }, select: { coach: { select: { id: true, name: true, email: true } } } }),
      prisma.teamMember.findMany({
        where: { teamId, active: true, role: { in: COACH_ROLES } },
        select: { userId: true, role: true, joinedAt: true, user: { select: { name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      resolveActiveSeason(teamId),
    ]);

    const activeRosterSeason = await prisma.season.findFirst({ where: { teamId, year: activeSeason }, select: { id: true } });
    const athleteCount = activeRosterSeason
      ? await prisma.seasonRoster.count({ where: { seasonId: activeRosterSeason.id, isActive: true } })
      : 0;

    const staff = mergeStaffRoster(
      team?.coach ?? null,
      members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }))
    );

    res.json({ athleteCount, staff });
  } catch (error) {
    console.error('Error fetching today staff:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/today/activity — recent shared-with-coach training logs and
// race-plan/reflection submissions, last 14 days, newest first. Nothing
// here ever includes an unshared training log (sharedWithCoach must be
// true — training logs are private by default) or an unshared reflection
// (same sharedWithCoach gate the existing race-reflections routes use).
// VOLUNTEER_COACH is group-scoped, same as everywhere else that shows
// per-athlete data to a volunteer.
router.get('/activity', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const windowStart = addDays(normalizeToday(), -14);
    const viewerRole = await resolveViewerRole(req);

    const [logs, reflections] = await Promise.all([
      prisma.trainingLog.findMany({
        where: { athlete: { teamId }, sharedWithCoach: true, createdAt: { gte: windowStart } },
        include: { athlete: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.raceReflection.findMany({
        where: {
          athlete: { teamId },
          sharedWithCoach: true,
          OR: [{ preSubmittedAt: { gte: windowStart } }, { postSubmittedAt: { gte: windowStart } }],
        },
        include: { athlete: { select: { id: true, name: true } }, race: { select: { id: true, name: true, date: true } } },
        take: 20,
      }),
    ]);

    async function volunteerLeadsAthlete(athleteId, onDate) {
      if (viewerRole !== 'VOLUNTEER_COACH') return false;
      const membershipRow = await getGroupOn(athleteId, onDate, 'TRAINING');
      if (!membershipRow) return false;
      const leaderRow = await prisma.groupLeader.findFirst({ where: { groupId: membershipRow.groupId, userId: req.user.id } });
      return Boolean(leaderRow);
    }

    const items = [];

    for (const log of logs) {
      const viewerLeadsAthleteGroup = await volunteerLeadsAthlete(log.athleteId, log.date);
      const canView = decideCanViewTrainingLog({
        viewerRole,
        isOwner: false,
        sharedWithCoach: log.sharedWithCoach,
        sharedWithTeam: log.sharedWithTeam,
        viewerLeadsAthleteGroup,
      });
      if (!canView) continue;
      items.push({
        type: 'training-log',
        athleteId: log.athleteId,
        athleteName: log.athlete.name,
        date: log.createdAt,
        summary: `${log.athlete.name} logged a ${log.type} run${log.distanceMi ? ` (${log.distanceMi}mi)` : ''}`,
      });
    }

    for (const r of reflections) {
      const viewerLeadsAthleteGroup = await volunteerLeadsAthlete(r.athleteId, r.race.date);
      const canView = decideCanViewReflection({
        viewerRole,
        isOwner: false,
        sharedWithCoach: r.sharedWithCoach,
        viewerLeadsAthleteGroup,
      });
      if (!canView) continue;

      if (r.preSubmittedAt && r.preSubmittedAt >= windowStart) {
        items.push({
          type: 'race-plan',
          athleteId: r.athleteId,
          athleteName: r.athlete.name,
          date: r.preSubmittedAt,
          summary: `${r.athlete.name} set a race plan for ${r.race.name}`,
          link: { raceId: r.raceId },
        });
      }
      if (r.postSubmittedAt && r.postSubmittedAt >= windowStart) {
        items.push({
          type: 'race-reflection',
          athleteId: r.athleteId,
          athleteName: r.athlete.name,
          date: r.postSubmittedAt,
          summary: `${r.athlete.name} reflected on ${r.race.name}`,
          link: { raceId: r.raceId },
        });
      }
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json({ items: items.slice(0, 10) });
  } catch (error) {
    console.error('Error fetching today activity:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
