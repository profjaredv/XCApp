const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const { ANY_COACH } = require('../lib/teamRoles');
const { getGroupOn } = require('../lib/groups');
const { computeLockAt, isPreRaceLocked, decideCanViewReflection } = require('../lib/raceReflections');

// T5 (Team Management handoff): "the most emotionally valuable thing in
// the app and the most sensitive." Every route here either scopes to the
// signed-in athlete's own row (requireLinkedAthlete) or goes through
// decideCanViewReflection's explicit allowlist — never a bare requireTeam
// with an inline check, given what's at stake if this leaks.

async function raceLockState(raceId) {
  const results = await prisma.result.findMany({ where: { raceId }, select: { createdAt: true } });
  const lockAt = computeLockAt({ resultCreatedAts: results.map((r) => r.createdAt) });
  return { lockAt, locked: isPreRaceLocked({ now: new Date(), lockAt }) };
}

// GET /api/race-reflections/mine/:raceId — the athlete's own reflection
// for a race (or defaults if they haven't written one yet), plus the
// current lock state so the UI can show "goals lock once results are in."
router.get('/mine/:raceId', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const reflection = await prisma.raceReflection.findUnique({
      where: { athleteId_raceId: { athleteId: req.user.linkedAthlete.id, raceId: race.id } },
    });
    const { locked, lockAt } = await raceLockState(race.id);

    res.json({
      reflection: reflection || {
        processGoal: null,
        outcomeGoal: null,
        targetTimeSec: null,
        targetSplits: null,
        keyFocus: null,
        preSubmittedAt: null,
        feelingRating: null,
        effortRating: null,
        whatWorked: null,
        whatDidnt: null,
        postNotes: null,
        postSubmittedAt: null,
        sharedWithCoach: true,
      },
      locked,
      lockAt,
    });
  } catch (error) {
    console.error('Error fetching race reflection:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/race-reflections/mine/:raceId/pre-race — rejected once the race
// has started (server-side, never just hidden client-side).
router.put('/mine/:raceId/pre-race', authenticate, requireLinkedAthlete, async (req, res) => {
  const { processGoal, outcomeGoal, targetTimeSec, targetSplits, keyFocus } = req.body;

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const { locked } = await raceLockState(race.id);
    if (locked) {
      return res.status(403).json({ msg: 'Goals are locked — this race has already started.' });
    }

    const data = {
      processGoal: processGoal ?? null,
      outcomeGoal: outcomeGoal ?? null,
      targetTimeSec: targetTimeSec ?? null,
      targetSplits: targetSplits ?? null,
      keyFocus: keyFocus ?? null,
      preSubmittedAt: new Date(),
    };

    const saved = await prisma.raceReflection.upsert({
      where: { athleteId_raceId: { athleteId: req.user.linkedAthlete.id, raceId: race.id } },
      update: data,
      create: { athleteId: req.user.linkedAthlete.id, raceId: race.id, ...data },
    });
    res.json(saved);
  } catch (error) {
    console.error('Error saving pre-race goals:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/race-reflections/mine/:raceId/post-race — never locks.
router.put('/mine/:raceId/post-race', authenticate, requireLinkedAthlete, async (req, res) => {
  const { feelingRating, effortRating, whatWorked, whatDidnt, postNotes } = req.body;

  if (feelingRating != null && (feelingRating < 1 || feelingRating > 10)) {
    return res.status(400).json({ msg: 'feelingRating must be between 1 and 10.' });
  }
  if (effortRating != null && (effortRating < 1 || effortRating > 10)) {
    return res.status(400).json({ msg: 'effortRating must be between 1 and 10.' });
  }

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const data = {
      feelingRating: feelingRating ?? null,
      effortRating: effortRating ?? null,
      whatWorked: whatWorked ?? null,
      whatDidnt: whatDidnt ?? null,
      postNotes: postNotes ?? null,
      postSubmittedAt: new Date(),
    };

    const saved = await prisma.raceReflection.upsert({
      where: { athleteId_raceId: { athleteId: req.user.linkedAthlete.id, raceId: race.id } },
      update: data,
      create: { athleteId: req.user.linkedAthlete.id, raceId: race.id, ...data },
    });
    res.json(saved);
  } catch (error) {
    console.error('Error saving post-race reflection:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/race-reflections/mine/:raceId/sharing — the visibility toggle
// itself is never locked by race timing, only the pre-race content is.
router.put('/mine/:raceId/sharing', authenticate, requireLinkedAthlete, async (req, res) => {
  const { sharedWithCoach } = req.body;
  if (typeof sharedWithCoach !== 'boolean') {
    return res.status(400).json({ msg: 'sharedWithCoach must be a boolean.' });
  }

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const saved = await prisma.raceReflection.upsert({
      where: { athleteId_raceId: { athleteId: req.user.linkedAthlete.id, raceId: race.id } },
      update: { sharedWithCoach },
      create: { athleteId: req.user.linkedAthlete.id, raceId: race.id, sharedWithCoach },
    });
    res.json(saved);
  } catch (error) {
    console.error('Error saving sharing preference:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/race-reflections/race/:raceId — coach-facing list, filtered
// through decideCanViewReflection. ATHLETE is never in this allowed-role
// list, so a captain (still just a TeamRole.ATHLETE) gets a flat 403 here
// regardless of who they lead or which reflections are shared — they
// never reach the per-row filter at all.
router.get('/race/:raceId', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const isOwnerCoach = req.user.team?.coachUid === req.user.id;
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } },
    });
    const viewerRole = isOwnerCoach ? 'HEAD_COACH' : membership?.role ?? null;

    const reflections = await prisma.raceReflection.findMany({
      where: { raceId: race.id },
      include: { athlete: { select: { id: true, name: true, preferredName: true } } },
    });

    const visible = [];
    for (const r of reflections) {
      let viewerLeadsAthleteGroup = false;
      if (viewerRole === 'VOLUNTEER_COACH') {
        const membershipRow = await getGroupOn(r.athleteId, race.date, 'TRAINING');
        if (membershipRow) {
          const leaderRow = await prisma.groupLeader.findFirst({ where: { groupId: membershipRow.groupId, userId: req.user.id } });
          viewerLeadsAthleteGroup = Boolean(leaderRow);
        }
      }
      const canView = decideCanViewReflection({
        viewerRole,
        isOwner: false, // this endpoint never serves the athlete's own copy back to themself
        sharedWithCoach: r.sharedWithCoach,
        viewerLeadsAthleteGroup,
      });
      if (canView) visible.push(r);
    }

    res.json(
      visible.map((r) => ({
        athleteId: r.athleteId,
        athleteName: r.athlete.preferredName || r.athlete.name,
        processGoal: r.processGoal,
        outcomeGoal: r.outcomeGoal,
        targetTimeSec: r.targetTimeSec,
        targetSplits: r.targetSplits,
        keyFocus: r.keyFocus,
        feelingRating: r.feelingRating,
        effortRating: r.effortRating,
        whatWorked: r.whatWorked,
        whatDidnt: r.whatDidnt,
        postNotes: r.postNotes,
      }))
    );
  } catch (error) {
    console.error('Error fetching race reflections:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
