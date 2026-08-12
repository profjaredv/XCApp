const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

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

module.exports = router;
