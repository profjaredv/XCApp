const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');

// A signed-in person asking for a team to be set up.
//
// Split out of routes/admin.js because this is the one endpoint in the
// team-request flow that is NOT super-admin only — anyone who has signed
// up and has no team needs to reach it. Mounting it here keeps
// /api/admin/* uniformly admin-gated rather than carving a public hole in
// it.
//
// Replaces the previous approach, which POSTed to /api/feedback with
// severity 'blocker'. That put a request to join the product in the same
// queue as bug reports, gave it no status, and — because POST /feedback
// never sends mail — notified nobody at all. The coach saw "Sent" and
// then heard nothing, with no way to tell whether it had arrived.

const MAX_MESSAGE = 1000;
const VALID_ROLES = new Set(['coach', 'athlete', 'parent']);

// POST /api/team-requests
router.post('/', authenticate, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  // Captured by the sign-up wizard before the account existed. Optional
  // because the plain form still posts here with only a message.
  const role = VALID_ROLES.has(req.body?.role) ? req.body.role : null;
  const teamName =
    typeof req.body?.teamName === 'string' && req.body.teamName.trim()
      ? req.body.teamName.trim().slice(0, 200)
      : null;

  // A team name is enough on its own — the wizard collects it as a field,
  // so a request no longer depends on someone writing prose.
  if (!message && !teamName) {
    return res.status(400).json({ message: 'Tell us your school and team name.' });
  }

  try {
    // One open request per person. Someone who submits twice because they
    // heard nothing back should not create a second row for the admin to
    // reconcile — update the message they most recently sent instead.
    const existing = await prisma.teamRequest.findFirst({
      where: { userId: req.user.id, status: 'pending' },
    });

    // When the person picked a real team out of search, they are asking
    // for access to it rather than for a new one. Verified server-side
    // rather than trusted from the body: a bad id would otherwise sit in
    // the admin queue pointing at nothing.
    let wantsTeamId = null;
    if (typeof req.body?.wantsTeamId === 'string' && req.body.wantsTeamId) {
      const team = await prisma.team.findUnique({
        where: { id: req.body.wantsTeamId },
        select: { id: true },
      });
      wantsTeamId = team?.id ?? null;
    }

    if (existing) {
      const updated = await prisma.teamRequest.update({
        where: { id: existing.id },
        data: {
          message: message.slice(0, MAX_MESSAGE),
          email: req.user.email,
          role,
          teamName,
          wantsTeamId,
        },
      });
      return res.status(200).json({ id: updated.id, status: updated.status, updated: true });
    }

    const created = await prisma.teamRequest.create({
      data: {
        userId: req.user.id,
        // Snapshotted, not joined: this is the address we told them we
        // would follow up at.
        email: req.user.email,
        name: req.user.name || null,
        message: message.slice(0, MAX_MESSAGE),
        role,
        teamName,
        wantsTeamId,
      },
    });

    res.status(201).json({ id: created.id, status: created.status, updated: false });
  } catch (error) {
    console.error('Error in POST /team-requests:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/team-requests/mine — so the onboarding screen can say "we have
// your request" on a return visit instead of showing a blank form as
// though nothing was ever sent.
router.get('/mine', authenticate, async (req, res) => {
  try {
    const request = await prisma.teamRequest.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, message: true, createdAt: true },
    });
    res.json(request);
  } catch (error) {
    console.error('Error in GET /team-requests/mine:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
