const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { requireApprovedGuardianLink } = require('../middleware/guardian');
const { resolveActiveSeason, deriveGrade } = require('../lib/season');

// POST /api/guardian/request-link
// A guardian isn't a team member — they don't have a join code flow of
// their own, so this reuses the team's existing join code as the "which
// team is this kid on" lookup, same as an athlete joining. Filing the
// request does NOT grant access by itself; a coach has to approve it (see
// POST /team/approve-guardian-link), same pattern as AthleteClaim.
router.post('/request-link', authenticate, async (req, res) => {
  const { joinCode, athleteId } = req.body;
  const userId = req.user.id;

  if (!joinCode || !athleteId) {
    return res.status(400).json({ msg: 'joinCode and athleteId are required.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { joinCode } });
    if (!team) {
      return res.status(404).json({ msg: 'Team not found for this join code.' });
    }

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: team.id } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found on that team.' });
    }

    const link = await prisma.guardianLink.upsert({
      where: { userId_athleteId: { userId, athleteId } },
      update: { status: 'pending', requestedAt: new Date(), resolvedAt: null, resolvedById: null },
      create: { userId, athleteId },
    });

    res.status(201).json({
      msg: `Request submitted for coach approval — you'll be able to view ${athlete.name}'s info once approved.`,
      status: link.status,
    });
  } catch (error) {
    console.error('Error requesting guardian link:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/guardian/my-links
// Self-scoped: every row returned belongs to req.user.id, never a
// body/param-supplied user id.
router.get('/my-links', authenticate, async (req, res) => {
  try {
    const links = await prisma.guardianLink.findMany({
      where: { userId: req.user.id },
      include: { athlete: { select: { id: true, name: true, teamId: true } } },
      orderBy: { requestedAt: 'desc' },
    });

    res.json(
      links.map((l) => ({
        athleteId: l.athleteId,
        athleteName: l.athlete.name,
        status: l.status,
        requestedAt: l.requestedAt,
        resolvedAt: l.resolvedAt,
      }))
    );
  } catch (error) {
    console.error('Error fetching guardian links:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/guardian/athletes/:athleteId
// Read-only. requireApprovedGuardianLink is the entire authorization
// boundary here — no requireTeam, since a guardian isn't a team member.
// Mirrors athletes.js GET /:athleteId's response shape (profile + race
// results for the active season) but deliberately excludes anything that
// route doesn't already return: no training log notes, no race
// reflections — neither exists on this response today, and neither should
// ever be added to it without a deliberate decision, per the doc's
// "may never see" list applying to coaches/captains and, by the same
// safeguarding logic, to guardians too.
router.get('/athletes/:athleteId', authenticate, requireApprovedGuardianLink, async (req, res) => {
  const { season } = req.query;

  try {
    const athlete = await prisma.athlete.findUnique({ where: { id: req.params.athleteId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = await resolveActiveSeason(athlete.teamId, season);

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, race: { season: seasonYear } },
      include: { race: true },
    });
    const sortedResults = results.sort((a, b) => new Date(a.race?.date || 0) - new Date(b.race?.date || 0));

    res.json({
      id: athlete.id,
      name: athlete.name,
      gender: athlete.gender,
      grade: deriveGrade(athlete.graduationYear, seasonYear),
      season: seasonYear,
      results: sortedResults,
    });
  } catch (error) {
    console.error('Error in GET /guardian/athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
