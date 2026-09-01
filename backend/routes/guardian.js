const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { requireApprovedGuardianLink } = require('../middleware/guardian');
const { resolveActiveSeason, deriveGrade } = require('../lib/season');

// POST /api/guardian/lookup
// Which athletes are on the team this join code belongs to.
//
// Reads only — it grants nothing and creates nothing, which is the whole
// point: a parent has to be able to SEE the roster to say which of these
// children are theirs, and doing that through POST /team/join would have
// made them a team member with role ATHLETE.
//
// The join code is the boundary, exactly as it is for an athlete joining.
// Anyone holding it can already join the team and see this same list, so
// showing names here discloses nothing new — and without a valid code this
// returns a 404 rather than any part of a roster.
router.post('/lookup', authenticate, async (req, res) => {
  const joinCode = typeof req.body?.joinCode === 'string' ? req.body.joinCode.trim() : '';
  if (!joinCode) {
    return res.status(400).json({ msg: 'A join code is required.' });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { joinCode },
      select: { id: true, name: true },
    });
    if (!team) {
      return res.status(404).json({ msg: 'No team found for that code.' });
    }

    const [athletes, existing] = await Promise.all([
      prisma.athlete.findMany({
        where: { teamId: team.id },
        select: { id: true, name: true, preferredName: true },
        orderBy: { name: 'asc' },
      }),
      // So the UI can show "already requested" instead of letting a parent
      // file the same request twice and wonder why nothing changed.
      prisma.guardianLink.findMany({
        where: { userId: req.user.id, athlete: { teamId: team.id } },
        select: { athleteId: true, status: true },
      }),
    ]);

    const statusByAthlete = new Map(existing.map((l) => [l.athleteId, l.status]));

    res.json({
      teamName: team.name,
      athletes: athletes.map((a) => ({
        id: a.id,
        name: a.preferredName || a.name,
        existingStatus: statusByAthlete.get(a.id) ?? null,
      })),
    });
  } catch (error) {
    console.error('Error in POST /guardian/lookup:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/guardian/request-link
// A guardian isn't a team member — they don't have a join code flow of
// their own, so this reuses the team's existing join code as the "which
// team is this kid on" lookup, same as an athlete joining. Filing the
// request does NOT grant access by itself; a coach has to approve it (see
// POST /team/approve-guardian-link), same pattern as AthleteClaim.
//
// Takes athleteIds (plural). A parent with two runners on the same team is
// the normal case, not an edge one, and making them repeat the whole flow
// per child was the kind of thing that reads as the product not knowing
// how families work. One GuardianLink row per child either way — the
// approval is still per-child, because a coach might reasonably approve
// one and not the other.
router.post('/request-link', authenticate, async (req, res) => {
  const { joinCode } = req.body;
  const userId = req.user.id;

  // Singular `athleteId` still accepted: older clients post it, and it is
  // the same request with one child.
  const ids = Array.isArray(req.body?.athleteIds)
    ? req.body.athleteIds
    : req.body?.athleteId
      ? [req.body.athleteId]
      : [];

  if (!joinCode || ids.length === 0) {
    return res.status(400).json({ msg: 'A join code and at least one athlete are required.' });
  }
  if (ids.length > 10) {
    return res.status(400).json({ msg: 'That is more athletes than one guardian can request at once.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { joinCode } });
    if (!team) {
      return res.status(404).json({ msg: 'Team not found for this join code.' });
    }

    // Every id is checked against THIS team. Without that, a parent
    // holding one team's code could file links against another team's
    // roster by posting ids from it.
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: ids }, teamId: team.id },
      select: { id: true, name: true, preferredName: true },
    });
    if (athletes.length === 0) {
      return res.status(404).json({ msg: 'None of those athletes are on that team.' });
    }

    await prisma.$transaction(
      athletes.map((athlete) =>
        prisma.guardianLink.upsert({
          where: { userId_athleteId: { userId, athleteId: athlete.id } },
          update: { status: 'pending', requestedAt: new Date(), resolvedAt: null, resolvedById: null },
          create: { userId, athleteId: athlete.id },
        })
      )
    );

    const names = athletes.map((a) => a.preferredName || a.name);
    res.status(201).json({
      msg:
        `Request submitted for coach approval — you'll be able to view ` +
        `${names.join(' and ')}'s info once approved.`,
      requested: athletes.map((a) => a.id),
      // Told plainly rather than silently dropped: a parent who mistyped
      // or picked a child who has since left should know.
      skipped: ids.filter((id) => !athletes.some((a) => a.id === id)).length,
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
