const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { resolveTeamRole } = require('../lib/loggingRole');

// GET /api/users/me
//
// req.user is the raw User row (see middleware/auth.js) — its `role` field
// is only the legacy 'coach'|'captain'|'athlete' UX hint, never the real
// per-team authorization role (see the long comment in requireRole). The
// frontend needs the actual TeamMember.role to gate anything more specific
// than "some kind of coach" (e.g. HEAD_COACH-only UI), so it's resolved
// here and attached as teamRole — null if this user has no active
// membership on their own team (e.g. the legacy owner fast-path in
// hasTeamRole, or no team at all).
router.get('/me', authenticate, async (req, res) => {
  // Same owner-fast-path-then-TeamMember-lookup precedence as
  // hasTeamRole (middleware/auth.js) — the team creator is HEAD_COACH
  // even before/without a TeamMember row, checked first there too. Shared
  // with usage logging (lib/loggingRole.js) so the two can't disagree.
  const teamRole = await resolveTeamRole(prisma, req.user);
  res.status(200).json({ ...req.user, teamRole });
});

// PUT /api/users/me
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      include: { team: true },
    });

    res.status(200).json({ message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error('Failed to update profile:', err.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
