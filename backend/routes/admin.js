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

module.exports = router;
