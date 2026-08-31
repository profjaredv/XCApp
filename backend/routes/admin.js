const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');
const prisma = require('../lib/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { sendEmail } = require('../lib/email');

const generateJoinCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
const CLAIM_TTL_DAYS = 30;
const FRONTEND_URL = process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://www.leadpack.cc' : 'http://localhost:5173');

// GET /api/admin/teams — every team on the platform, for the super-admin
// team switcher (see middleware/auth.js's X-Admin-Team-Id handling in
// authenticate for how a selected team actually takes effect). This route
// itself grants no team access — it's purely "what can I pick from."
router.get('/teams', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        athleticTeamId: true,
        currentSeason: true,
        _count: { select: { athletes: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        athleticTeamId: t.athleticTeamId,
        currentSeason: t.currentSeason,
        athleteCount: t._count.athletes,
      }))
    );
  } catch (error) {
    console.error('Error listing teams for admin:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/teams
// F2 (LeadPack Master Build Handoff): the ONLY way a new team is created —
// self-serve POST /api/teams is gone. The owner supplies name,
// athleticTeamId, and the head coach's email; this creates the Team and a
// pending TeamClaim, with no User and no TeamMember yet — nobody is signed
// in as this coach until they claim it (routes/teamClaims.js). Identity is
// verified by construction: the owner already knows this coach, or is one
// call to the athletic director away from confirming who they are.
router.post('/teams', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, athleticTeamId, email } = req.body || {};

  if (!name || !athleticTeamId || !email || !email.includes('@')) {
    return res.status(400).json({ message: 'Team name, Athletic.net Team ID, and a valid head-coach email are required.' });
  }

  try {
    const existingTeam = await prisma.team.findUnique({ where: { athleticTeamId: String(athleticTeamId) } });
    if (existingTeam) {
      return res.status(409).json({ message: 'A team with this Athletic.net ID already exists.' });
    }

    let joinCode;
    for (let attempt = 0; attempt < 5 && !joinCode; attempt++) {
      const candidate = generateJoinCode();
      const clash = await prisma.team.findUnique({ where: { joinCode: candidate }, select: { id: true } });
      if (!clash) joinCode = candidate;
    }
    if (!joinCode) {
      return res.status(500).json({ message: 'Could not generate a unique join code — try again.' });
    }

    const expiresAt = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);

    const team = await prisma.team.create({
      data: {
        name,
        athleticTeamId: String(athleticTeamId),
        joinCode,
        claim: { create: { email, expiresAt } },
      },
      include: { claim: true },
    });

    const claimLink = `${FRONTEND_URL}/claim/${team.claim.token}`;
    let emailSent = false;
    try {
      const result = await sendEmail({
        to: email,
        subject: `Set up ${name} on LeadPack`,
        html: `<p>You've been set up as head coach of <strong>${name}</strong> on LeadPack.</p>`
          + `<p><a href="${claimLink}">${claimLink}</a></p>`
          + `<p>This link is for the head coach of ${name}, or someone with their explicit authorization to manage `
          + `the team on their behalf. It expires on ${expiresAt.toDateString()}.</p>`,
      });
      emailSent = result.sent;
    } catch (error) {
      console.error('Error sending team claim email:', error.message);
    }

    res.status(201).json({
      message: emailSent ? `Claim link sent to ${email}.` : `Claim link ready for ${email}.`,
      emailSent,
      team: { id: team.id, name: team.name, athleticTeamId: team.athleticTeamId },
      claimToken: team.claim.token,
      claimLink,
    });
  } catch (error) {
    console.error('Error creating team (admin):', error.message);
    res.status(500).json({ message: 'Failed to create team.' });
  }
});



// ---------------------------------------------------------------------------
// Team requests and the platform dashboard.
//
// Before this, a coach asking for a team POSTed a Feedback row with
// severity 'blocker' and nothing else happened — no mail was sent (POST
// /feedback never called sendEmail), no status existed, and the request
// sat among bug reports. The dashboard below IS the notification: the
// pending count is the thing to check, rather than an email that may
// never arrive and cannot be actioned.

// POST /api/team-requests is mounted separately (see below) because any
// signed-in user must reach it; everything else here is super-admin only.

// GET /api/admin/overview — the numbers on the dashboard.
//
// Deliberately a small fixed set of counts rather than a flexible query
// API. This is one person's dashboard; a slow generic reporting endpoint
// would be a worse version of just adding the number you actually want.
router.get('/overview', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      teams, users, athletes, results, trainingLogs,
      pendingRequests, newUsersWeek, newTeamsMonth,
      activeTeamsWeek, paidTeams,
    ] = await Promise.all([
      prisma.team.count(),
      prisma.user.count(),
      prisma.athlete.count(),
      prisma.result.count(),
      prisma.trainingLog.count(),
      prisma.teamRequest.count({ where: { status: 'pending' } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.team.count({ where: { createdAt: { gte: monthAgo } } }),
      // "Active" means someone opened a screen, which is the only signal
      // that distinguishes a team using the product from a team that was
      // created and abandoned.
      prisma.pageView
        .findMany({
          where: { createdAt: { gte: weekAgo }, teamId: { not: null } },
          select: { teamId: true },
          distinct: ['teamId'],
        })
        .then((rows) => rows.length),
      prisma.team.count({ where: { plan: 'active' } }),
    ]);

    res.json({
      totals: { teams, users, athletes, results, trainingLogs },
      pendingRequests,
      recent: { newUsersWeek, newTeamsMonth, activeTeamsWeek, paidTeams },
    });
  } catch (error) {
    console.error('Error in GET /admin/overview:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/activity — what has actually been happening, newest first.
//
// Assembled from the tables that record real work rather than from a
// dedicated audit log: teams created, athletes added, results imported,
// requests filed. An audit log would be more precise and is worth building
// later; this answers "is anyone using it" today without a migration.
router.get('/activity', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const [teams, requests, races] = await Promise.all([
      prisma.team.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.teamRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, email: true, message: true, status: true, createdAt: true },
      }),
      prisma.race.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, name: true, createdAt: true,
          team: { select: { name: true } },
          _count: { select: { results: true } },
        },
      }),
    ]);

    const events = [
      ...teams.map((t) => ({
        kind: 'team_created', at: t.createdAt,
        title: t.name, detail: 'Team created',
      })),
      ...requests.map((r) => ({
        kind: 'team_requested', at: r.createdAt,
        title: r.email, detail: `Requested a team — ${r.status}`,
      })),
      ...races.map((r) => ({
        kind: 'race_added', at: r.createdAt,
        title: r.name,
        detail: `${r._count.results} results · ${r.team?.name ?? 'unknown team'}`,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 25);

    res.json(events);
  } catch (error) {
    console.error('Error in GET /admin/activity:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/team-requests?status=
router.get('/team-requests', authenticate, requireSuperAdmin, async (req, res) => {
  const status = ['pending', 'approved', 'declined'].includes(req.query.status)
    ? req.query.status
    : undefined;

  try {
    const requests = await prisma.teamRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    });
    res.json(requests);
  } catch (error) {
    console.error('Error in GET /admin/team-requests:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/team-requests/:id/approve
//
// Creates the team, its join code and its claim, emails the coach the
// claim link, and closes the request — the same work POST /admin/teams
// does, in one action, so approving is a button rather than a sequence of
// steps a person has to remember to finish.
router.post('/team-requests/:id/approve', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, athleticTeamId, email } = req.body || {};

  if (!name || !athleticTeamId || !email || !email.includes('@')) {
    return res.status(400).json({
      message: 'Team name, Athletic.net Team ID, and a valid head-coach email are required.',
    });
  }

  try {
    const request = await prisma.teamRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(409).json({ message: `This request was already ${request.status}.` });
    }

    const existingTeam = await prisma.team.findUnique({
      where: { athleticTeamId: String(athleticTeamId) },
    });
    if (existingTeam) {
      return res.status(409).json({ message: 'A team with this Athletic.net ID already exists.' });
    }

    let joinCode;
    for (let attempt = 0; attempt < 5 && !joinCode; attempt++) {
      const candidate = generateJoinCode();
      const clash = await prisma.team.findUnique({ where: { joinCode: candidate }, select: { id: true } });
      if (!clash) joinCode = candidate;
    }
    if (!joinCode) {
      return res.status(500).json({ message: 'Could not generate a unique join code — try again.' });
    }

    const expiresAt = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Team + claim + request resolution together: a team created without
    // its request being closed would show up as still pending and get
    // approved twice.
    const { team } = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name,
          athleticTeamId: String(athleticTeamId),
          joinCode,
          claim: { create: { email, expiresAt } },
        },
        include: { claim: true },
      });
      await tx.teamRequest.update({
        where: { id: request.id },
        data: {
          status: 'approved',
          resolvedAt: new Date(),
          resolvedById: req.user.id,
          createdTeamId: created.id,
        },
      });
      return { team: created };
    });

    // Best-effort, matching POST /admin/teams: the claim link comes back
    // in the response either way, so an unconfigured mailer never leaves a
    // team stranded with no way to claim it.
    const claimLink = `${FRONTEND_URL}/claim/${team.claim.token}`;
    let emailSent = false;
    try {
      const result = await sendEmail({
        to: email,
        subject: `Set up ${name} on LeadPack`,
        html: `<p>You've been set up as head coach of <strong>${name}</strong> on LeadPack.</p>`
          + `<p><a href="${claimLink}">${claimLink}</a></p>`
          + `<p>This link expires on ${expiresAt.toDateString()}.</p>`,
      });
      emailSent = result.sent;
    } catch (error) {
      console.error('Error sending team claim email:', error.message);
    }

    res.status(201).json({
      team: { id: team.id, name: team.name, athleticTeamId: team.athleticTeamId, joinCode: team.joinCode },
      claimLink,
      emailSent,
    });
  } catch (error) {
    console.error('Error in POST /admin/team-requests/:id/approve:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/team-requests/:id/decline
//
// Records the decision without emailing anyone. Declining a request is
// often "this is a duplicate" or "I already set them up by hand", and an
// automatic rejection email would be wrong in both cases.
router.post('/team-requests/:id/decline', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const request = await prisma.teamRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(409).json({ message: `This request was already ${request.status}.` });
    }

    const updated = await prisma.teamRequest.update({
      where: { id: request.id },
      data: {
        status: 'declined',
        resolvedAt: new Date(),
        resolvedById: req.user.id,
        adminNote: typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error in POST /admin/team-requests/:id/decline:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
