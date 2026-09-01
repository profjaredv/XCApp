const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');

// "Find your team" — the one step of sign-up that has to work before an
// account exists.
//
// UNAUTHENTICATED, deliberately, and scoped as tightly as that allows. The
// alternative was making people create an account before they could learn
// whether their school was even on LeadPack, which is the ordering problem
// this whole flow exists to fix.
//
// What it discloses: that a school by a given name uses LeadPack. That is
// the same fact a coach's public Athletic.net page already reveals, and it
// is a customer list, not student data. No athlete, coach, roster count,
// join code or email is reachable here — and the join code specifically
// must never be added to this response, it is a bearer credential (see
// lib/exportManifest.js's SENSITIVE_FIELDS).
//
// What it refuses: enumeration. A query under three characters returns
// nothing rather than every team, results are capped, there is no cursor
// so the list cannot be walked, and the route is rate-limited per IP in
// server.js.

const MIN_QUERY = 3;
const MAX_RESULTS = 8;

// GET /api/team-directory/search?q=
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (q.length < MIN_QUERY) {
    return res.json({ query: q, results: [], tooShort: true });
  }

  try {
    const teams = await prisma.team.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      // An explicit select, never a filter applied afterwards: omitting it
      // would mean every column added to Team in future silently becomes
      // public.
      select: {
        id: true,
        name: true,
        athleticTeamId: true,
        members: {
          where: { role: 'HEAD_COACH' },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      take: MAX_RESULTS,
    });

    res.json({
      query: q,
      results: teams.map((team) => ({
        id: team.id,
        name: team.name,
        athleticTeamId: team.athleticTeamId,
        // Whether a head coach exists, never who they are. This is what
        // lets the next screen say "ask your head coach to invite you"
        // rather than offering a path that would go nowhere.
        hasHeadCoach: team.members.length > 0,
      })),
    });
  } catch (error) {
    console.error('Error in GET /team-directory/search:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
