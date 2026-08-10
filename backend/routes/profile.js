const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');

// GET /api/profile
// Fetches the profile of the authenticated user.
router.get('/', authenticate, async (req, res) => {
  const user = req.user;
  res.status(200).json({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    team: user.team || null,
  });
});

// POST /api/profile/join-team
// Allows an authenticated user to join a team using a join code.
router.post('/join-team', authenticate, async (req, res) => {
  const { joinCode } = req.body;
  const userId = req.user.id;

  if (!joinCode) {
    return res.status(400).json({ message: 'Join code is required.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { joinCode } });
    if (!team) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      update: {},
      create: { teamId: team.id, userId, role: 'ATHLETE' },
    });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { teamId: team.id },
      include: { team: true },
    });

    res.status(200).json({
      success: true,
      message: 'Successfully joined team.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error joining team:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/profile/upgrade-to-coach — RETIRED (T1, Team Management
// handoff). This used to let anyone who learned COACH_UPGRADE_CODE become
// a coach on whatever team they happened to be on at the time — a shared
// secret with no record of who granted it or why. Replaced by
// POST /team/staff-invite: a head coach names an exact email and exact
// role (HEAD_COACH/COACH/VOLUNTEER_COACH), accepted at
// POST /team/accept-staff-invite. Kept registered as 410 Gone, rather than
// deleted outright, so a stale client/bookmark gets a clear explanation
// instead of an ambiguous 404.
router.post('/upgrade-to-coach', authenticate, async (req, res) => {
  res.status(410).json({
    message:
      'Self-service coach upgrade codes have been retired. Ask your head coach to send you a staff invite instead.',
  });
});

// POST /api/profile/fix-coach-role
// Restores coach role for a user who owns a team but lost the role flag
// (e.g. it was reset by a bug, or their row predates a schema change).
// Scoped to teams the caller actually owns via coach_uid — safe by
// construction, not by convention.
router.post('/fix-coach-role', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const ownedTeam = await prisma.team.findFirst({ where: { coachUid: userId } });
    if (!ownedTeam) {
      return res.status(400).json({ message: 'User does not own any team.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: 'coach', teamId: ownedTeam.id },
      include: { team: true },
    });

    res.json({
      message: 'Coach role restored successfully.',
      user: {
        uid: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        team: updatedUser.team,
      },
    });
  } catch (error) {
    console.error('Error fixing coach role:', error.message);
    res.status(500).json({ message: 'Failed to fix coach role.' });
  }
});

module.exports = router;
